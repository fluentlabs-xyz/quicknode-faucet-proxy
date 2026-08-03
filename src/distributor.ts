import z from "zod";
import { queries, type TransferRecord } from "./db";
import { ERC20TokenService } from "./erc20";
import { log } from "./logger";
import { quickNodeService } from "./quicknode";
import type {
  ClaimRequest,
  ClaimResult,
  DistributorConfig,
  GlobalConfig,
} from "./types";
import {
  validateJwt,
  getPrivyEmbeddedWallet,
  getParaWallets,
  type ParaJwtPayload,
  type PrivyJwtPayload,
} from "./utils/jwtValidator";
import { deriveKernelAddress } from "./utils/smartAccount";
import { NFTOwnershipValidator } from "./validators/nft";
import { OnceOnlyValidator, TimeLimitValidator } from "./validators/time";

// ========== FACTORY ==========

export async function createDistributors(
  configPath: string,
): Promise<Map<string, Distributor>> {
  const distributors = new Map<string, Distributor>();

  const configFile = await Bun.file(configPath).text();
  const config: GlobalConfig = JSON.parse(
    configFile.replace(/\$\{([^}]+)\}/g, (_, key) => Bun.env[key] || ""),
  );

  for (const [path, distConfig] of Object.entries(config.distributors)) {
    const distributor = new Distributor({
      path,
      distributorId: distConfig.distributorId,
      distributorApiKey: distConfig.distributorApiKey,
      dripAmount: distConfig.dripAmount,
      validators: distConfig.validators,
      erc20Configs: distConfig.erc20Configs,
    });

    distributors.set(path, distributor);
  }

  log.info("Distributors initialized", "config", undefined, {
    count: distributors.size,
    paths: Array.from(distributors.keys()),
  });

  return distributors;
}

// ========== CONFIG SCHEMAS ==========

const ParaConfigSchema = z.object({
  jwksUrl: z.url(),
  verifyUrl: z.url().optional(),
  secretKey: z.string().optional(),
});

// EntryPoint 0.7 supports Kernel v3 only - @zerodev/sdk GetKernelVersion<"0.7">
const SmartAccountConfigSchema = z.object({
  kernelVersion: z.enum(["0.3.0", "0.3.1", "0.3.2", "0.3.3"]),
  index: z.number().int().min(0).default(0),
});

const PrivyConfigSchema = z.object({
  jwksUrl: z.url(),
  appId: z.string().min(1),
  smartAccount: SmartAccountConfigSchema.optional(),
});

type ParaConfig = z.infer<typeof ParaConfigSchema>;
type PrivyConfig = z.infer<typeof PrivyConfigSchema>;

type IdentityConfig =
  | { mode: "para"; para: ParaConfig }
  | { mode: "privy"; privy: PrivyConfig }
  | { mode: "direct" };

// ========== DISTRIBUTOR ==========

export class Distributor {
  private identity: IdentityConfig;

  private timeLimitValidator?: TimeLimitValidator;
  private onceOnlyValidator?: OnceOnlyValidator;
  private nftValidator?: NFTOwnershipValidator;

  private erc20Services: ERC20TokenService[] = [];

  constructor(private readonly cfg: DistributorConfig) {
    this.identity = this.parseIdentityConfig();
    this.parseValidatorConfigs();

    if (cfg.erc20Configs) {
      this.erc20Services = cfg.erc20Configs.map(
        (c) => new ERC20TokenService(c),
      );
    }

    log.info("Distributor initialized", "distributor", undefined, {
      path: cfg.path,
      mode: this.identity.mode,
      onceOnly: !!this.onceOnlyValidator,
      timeLimit: !!this.timeLimitValidator,
      nft: !!this.nftValidator,
      erc20Tokens: this.erc20Services.length,
      distributorId: cfg.distributorId,
      distributorPath: cfg.path,
    });
  }

  get path() {
    return this.cfg.path;
  }

  get id() {
    return this.cfg.distributorId;
  }

  private getLogContext() {
    return {
      distributorId: this.cfg.distributorId,
      distributorPath: this.cfg.path,
    };
  }

  // ========== CONFIG PARSING ==========

  private parseIdentityConfig(): IdentityConfig {
    const configs = this.cfg.validators;
    if (!configs) {
      throw new Error(`No validator configs for ${this.cfg.path}`);
    }

    const hasPara = !!configs["para-account"];
    const hasPrivy = !!configs["privy-account"];
    const hasDirect = !!configs["direct"];

    const count = [hasPara, hasPrivy, hasDirect].filter(Boolean).length;

    if (count !== 1) {
      throw new Error(
        `Exactly one of "para-account", "privy-account", or "direct" must be configured for ${this.cfg.path}`,
      );
    }

    if (hasPara) {
      return {
        mode: "para",
        para: ParaConfigSchema.parse(configs["para-account"]),
      };
    }

    if (hasPrivy) {
      return {
        mode: "privy",
        privy: PrivyConfigSchema.parse(configs["privy-account"]),
      };
    }

    return { mode: "direct" };
  }

  private parseValidatorConfigs(): void {
    const configs = this.cfg.validators;
    if (!configs) return;

    if (configs["once-only"]) {
      this.onceOnlyValidator = new OnceOnlyValidator();
    }

    if (configs["weekly-limit"]) {
      const old = configs["weekly-limit"] as {
        maxClaimsPerWeek?: number;
        cooldownHours?: number;
      };
      this.timeLimitValidator = new TimeLimitValidator({
        period: "week",
        maxClaims: old.maxClaimsPerWeek || 3,
        cooldownHours: old.cooldownHours || 24,
      });
    } else if (configs["time-limit"]) {
      this.timeLimitValidator = new TimeLimitValidator(configs["time-limit"]);
    }

    if (configs["nft-ownership"]) {
      this.nftValidator = new NFTOwnershipValidator(configs["nft-ownership"]);
    }
  }

  // ========== REQUEST PARSING ==========

  async parseRequestFromBody(
    body: unknown,
    headers: Headers,
  ): Promise<ClaimRequest> {
    const rawBody = body as Record<string, unknown>;

    if (!rawBody?.visitorId) {
      throw new Error("Missing visitorId");
    }

    const clientIp = this.extractClientIP(headers);

    if (this.identity.mode === "direct") {
      const walletAddress = rawBody.walletAddress as string;
      if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/i.test(walletAddress)) {
        throw new Error("Invalid or missing wallet address");
      }

      return {
        visitorId: rawBody.visitorId as string,
        clientIp,
        walletAddress: walletAddress as `0x${string}`,
        ...rawBody,
      };
    }

    const authHeader = headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : undefined;

    if (!token) {
      throw new Error("Authorization token is required");
    }

    return {
      visitorId: rawBody.visitorId as string,
      clientIp,
      token,
      ...rawBody,
    };
  }

  private extractClientIP(headers: Headers): string {
    return (
      headers.get("cf-connecting-ip") ||
      headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headers.get("x-real-ip") ||
      ""
    );
  }

  // ========== CLAIM PROCESSING ==========

  async processClaim(
    request: ClaimRequest,
    requestId?: string,
  ): Promise<ClaimResult> {
    try {
      const wallet = await this.resolveWallet(request, requestId);

      await this.runValidators(wallet, requestId);

      return await this.executePayout(wallet, request, requestId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Claim processing failed";
      if (requestId) {
        log.info("Claim failed", "distributor", requestId, {
          error: message,
          ...this.getLogContext(),
        });
      }
      return { success: false, error: message };
    }
  }

  // ========== WALLET RESOLUTION ==========

  private async resolveWallet(
    request: ClaimRequest,
    requestId?: string,
  ): Promise<string> {
    switch (this.identity.mode) {
      case "direct": {
        if (!request.walletAddress) {
          throw new Error("Wallet address required in direct mode");
        }
        return request.walletAddress;
      }

      case "para": {
        if (!request.token) {
          throw new Error("Authorization token required");
        }
        return this.resolveParaWallet(
          request.token,
          this.identity.para,
          requestId,
        );
      }

      case "privy": {
        if (!request.token) {
          throw new Error("Authorization token required");
        }
        return this.resolvePrivyWallet(
          request.token,
          this.identity.privy,
          requestId,
        );
      }
    }
  }

  private async resolveParaWallet(
    token: string,
    config: ParaConfig,
    requestId?: string,
  ): Promise<string> {
    const result = await validateJwt<ParaJwtPayload>(token, config.jwksUrl);

    if (!result.valid) {
      throw new Error(`Invalid Para token: ${result.error}`);
    }

    const { embeddedWallet, externalWallet } = getParaWallets(result.payload);

    if (config.verifyUrl) {
      await this.verifyParaProject(embeddedWallet, config);
    }

    if (requestId) {
      log.debug("Para wallet resolved", "distributor", requestId, {
        embeddedWallet,
        externalWallet,
        userId: result.payload.data.userId,
        ...this.getLogContext(),
      });
    }

    // Para uses externalWallet for rate limiting, embeddedWallet for payout
    // Store both but return embeddedWallet as the main wallet
    return embeddedWallet;
  }

  private async resolvePrivyWallet(
    token: string,
    config: PrivyConfig,
    requestId?: string,
  ): Promise<string> {
    const result = await validateJwt<PrivyJwtPayload>(token, config.jwksUrl, {
      audience: config.appId,
      issuer: "privy.io",
    });

    if (!result.valid) {
      throw new Error(`Invalid Privy token: ${result.error}`);
    }

    const signer = getPrivyEmbeddedWallet(result.payload);

    const wallet = config.smartAccount
      ? await deriveKernelAddress(signer, config.smartAccount)
      : signer;

    if (requestId) {
      log.debug("Privy wallet resolved", "distributor", requestId, {
        wallet,
        signer,
        smartAccount: !!config.smartAccount,
        userId: result.payload.sub,
        ...this.getLogContext(),
      });
    }

    return wallet;
  }

  private async verifyParaProject(
    address: string,
    config: ParaConfig,
  ): Promise<void> {
    if (!config.verifyUrl) return;

    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (config.secretKey) {
      headers["x-external-api-key"] = config.secretKey;
    }

    const resp = await fetch(config.verifyUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ address }),
    });

    if (resp.status === 404) return;

    if (!resp.ok) {
      throw new Error(
        `Para wallet verification failed: ${resp.status} ${resp.statusText}`,
      );
    }
  }

  // ========== VALIDATORS ==========

  private async runValidators(
    wallet: string,
    requestId?: string,
  ): Promise<void> {
    if (this.onceOnlyValidator) {
      await this.onceOnlyValidator.validate(
        wallet,
        this.cfg.distributorId,
        requestId,
      );
    }

    if (this.timeLimitValidator) {
      await this.timeLimitValidator.validate(
        wallet,
        this.cfg.distributorId,
        requestId,
      );
    }

    if (this.nftValidator) {
      await this.nftValidator.validate(wallet, requestId);
    }
  }

  // ========== PAYOUT EXECUTION ==========

  private async executePayout(
    wallet: string,
    request: ClaimRequest,
    requestId?: string,
  ): Promise<ClaimResult> {
    const logContext = this.getLogContext();

    const response = await quickNodeService.submitClaim(
      this.cfg.distributorApiKey,
      {
        address: wallet,
        ip: request.clientIp,
        visitorId: request.visitorId,
      },
      requestId,
      logContext,
    );

    if (!response.success) {
      throw new Error(response.message || "Claim rejected by QuickNode");
    }

    const transfers: TransferRecord[] = [
      {
        tokenType: "native",
        txHash: response.transactionId || null,
        amount: this.cfg.dripAmount,
        success: true,
      },
    ];
    let hasFailedErc20Transfer = false;

    for (const service of this.erc20Services) {
      const result = await service.transferTokens(wallet, requestId, logContext);

      transfers.push({
        tokenType: "erc20",
        tokenAddress: service.getTokenAddress(),
        txHash: result.txHash || null,
        amount: service.getAmount(),
        success: result.success,
        error: result.error,
      });

      if (!result.success) {
        hasFailedErc20Transfer = true;
        log.error(
          "ERC20 transfer failed",
          "distributor",
          result.error,
          requestId,
          {
            wallet,
            token: service.getTokenAddress(),
            ...logContext,
          },
        );
      }
    }

    const claimId = await queries.insertClaim({
      distributorId: this.cfg.distributorId,
      embeddedWallet: wallet,
      externalWallet: wallet, // Same as embedded for Privy
      visitorId: request.visitorId,
      ip: request.clientIp,
      txId: response.transactionId || null,
      amount: this.cfg.dripAmount,
    });

    await queries.insertTransfers(claimId, transfers);

    return {
      success: true,
      transactionId: response.transactionId || "",
      amount: this.cfg.dripAmount,
      message: hasFailedErc20Transfer
        ? "Claim processed, but one or more ERC20 transfers failed"
        : "Claim processed successfully",
      transfers,
    };
  }
}
