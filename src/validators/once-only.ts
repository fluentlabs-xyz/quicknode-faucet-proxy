import { z } from "zod";
import type { IValidator, ValidationResult, ClaimRequest } from "../types";
import { queries } from "../database";
import { logger } from "../logger";

const OnceOnlyConfigSchema = z.object({
  distributorId: z.string().min(1, "Distributor ID is required"),
});

export class OnceOnlyValidator implements IValidator {
  readonly name = "once-only";
  readonly configSchema = OnceOnlyConfigSchema;

  private readonly distributorId: string;

  constructor(config: Record<string, unknown>) {
    const parsed = this.configSchema.parse(config);
    this.distributorId = parsed.distributorId;
  }

  async validate(request: ClaimRequest): Promise<ValidationResult> {
    try {
      const walletAddress =
        (request.externalWallet as `0x${string}`) || (request.walletAddress as string);

      if (!walletAddress) {
        return {
          success: false,
          error: "No wallet address provided for once-only validation",
        };
      }

      const existingClaim = await queries.checkExistingClaim(
        walletAddress,
        this.distributorId
      );

      if (existingClaim) {
        return {
          success: false,
          error: `This wallet has already claimed from distributor '${this.distributorId}'. Only one claim is allowed per wallet per distributor.`,
        };
      }

      return {
        success: true,
        data: {
          validatedWallet: walletAddress,
          distributorId: this.distributorId,
          claimStatus: "new",
        },
      };
    } catch (error) {
      logger.error("Error in once-only validation", {
        error: error instanceof Error ? error.message : String(error),
        component: "once-only-validator",
        distributorId: this.distributorId,
      });
      return {
        success: false,
        error: `Once-only validation failed: ${
          error instanceof Error ? error.message : "Unknown database error"
        }`,
      };
    }
  }
}
