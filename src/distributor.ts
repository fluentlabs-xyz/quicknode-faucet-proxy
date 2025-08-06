import type {
  HealthStatus,
  IValidator,
  ClaimRequest,
  ClaimResult,
} from "./types";
import { quickNodeService } from "./quicknode";
import { queries } from "./database";
import { logger } from "./logger";

export interface DistributorOptions {
  id: string;
  name: string;
  path: string;
  distributorId: string;
  distributorApiKey: string;
  dripAmount: number;
  validators: IValidator[];
}

export class Distributor {
  constructor(private readonly options: DistributorOptions) {
    if (!options.validators.length) {
      throw new Error(`No validators for distributor ${options.name}`);
    }

    logger.info("Distributor initialized", {
      component: "distributor",
      id: options.id,
      path: options.path,
      validatorCount: options.validators.length,
    });
  }

  get id() {
    return this.options.id;
  }
  get name() {
    return this.options.name;
  }
  get path() {
    return this.options.path;
  }

  async parseRequestFromBody(
    body: unknown,
    headers: Headers
  ): Promise<ClaimRequest> {
    const rawBody = body as Record<string, unknown>;

    if (!rawBody?.visitorId) {
      throw new Error("Missing visitorId");
    }

    return {
      visitorId: rawBody.visitorId as string,
      clientIp:
        headers.get("cf-connecting-ip") ||
        headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        headers.get("x-real-ip") ||
        "",
      token: headers.get("authorization")?.startsWith("Bearer ")
        ? headers.get("authorization")!.slice(7)
        : undefined,
      ...rawBody,
    };
  }

  async processClaim(request: ClaimRequest): Promise<ClaimResult> {
    try {
      let validationData: Record<string, unknown> = {};

      for (const validator of this.options.validators) {
        const result = await validator.validate(request);
        if (!result.success) {
          throw new Error(result.error || "Validation failed");
        }
        if (result.data) {
          validationData = { ...validationData, ...result.data };
          Object.assign(request, result.data);
        }
      }

      const walletAddress =
        validationData.embeddedWallet ||
        validationData.validatedWallet ||
        request.walletAddress;

      if (!walletAddress) {
        throw new Error("No wallet address available");
      }

      const response = await quickNodeService.submitClaim(
        this.options.distributorApiKey,
        {
          address: walletAddress as string,
          ip: request.clientIp,
          visitorId: request.visitorId,
        }
      );

      if (!response.success) {
        throw new Error(response.message || "Claim rejected");
      }

      await queries.insertClaim({
        distributorId: this.options.distributorId,
        embeddedWallet:
          (validationData.embeddedWallet as string) ||
          (walletAddress as string),
        externalWallet:
          (validationData.externalWallet as string) ||
          (walletAddress as string),
        visitorId: request.visitorId,
        ip: request.clientIp,
        txId: response.transactionId || null,
        amount: this.options.dripAmount,
      });

      return {
        success: true,
        transactionId: response.transactionId || "",
        amount: this.options.dripAmount,
        message: "Claim processed successfully",
      };
    } catch (error) {
      logger.error("Claim failed", {
        error: error instanceof Error ? error.message : String(error),
        distributorId: this.options.id,
        visitorId: request.visitorId,
      });
      throw error;
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      details: {
        distributorId: this.options.id,
        name: this.options.name,
        path: this.options.path,
        validatorCount: this.options.validators.length,
        dripAmount: this.options.dripAmount,
      },
    };
  }
}
