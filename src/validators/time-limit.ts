import { z } from "zod";
import type { IValidator, ValidationResult, ClaimRequest } from "../types";
import { queries } from "../database";
import { logger } from "../logger";

const TimeLimitConfigSchema = z.object({
  distributorId: z.string().min(1, "Distributor ID is required"),
  cooldownHours: z
    .number()
    .int("Cooldown hours must be a whole number")
    .min(1, "Cooldown must be at least 1 hour")
    .max(8760, "Cooldown cannot exceed 1 year"),
});

export class TimeLimitValidator implements IValidator {
  readonly name = "time-limit";
  readonly configSchema = TimeLimitConfigSchema;

  private readonly distributorId: string;
  private readonly cooldownHours: number;

  constructor(config: Record<string, unknown>) {
    const parsed = this.configSchema.parse(config);
    this.distributorId = parsed.distributorId;
    this.cooldownHours = parsed.cooldownHours;
  }

  async validate(request: ClaimRequest): Promise<ValidationResult> {
    try {
      const walletAddress =
        (request.externalWallet as `0x${string}`) || (request.walletAddress as string);

      if (!walletAddress) {
        return {
          success: false,
          error: "No wallet address provided for time-limit validation",
        };
      }

      const lastClaimTime = await queries.getLastClaimTime(
        walletAddress,
        this.distributorId
      );

      if (lastClaimTime) {
        const timeSinceLastClaim = Date.now() - lastClaimTime.getTime();
        const cooldownPeriod = this.cooldownHours * 60 * 60 * 1000;

        if (timeSinceLastClaim < cooldownPeriod) {
          const remainingHours = Math.ceil(
            (cooldownPeriod - timeSinceLastClaim) / (60 * 60 * 1000)
          );

          return {
            success: false,
            error: `Cooldown period active. You can claim again in ${remainingHours} hour(s).`,
          };
        }
      }

      return {
        success: true,
        data: {
          validatedWallet: walletAddress,
          distributorId: this.distributorId,
          cooldownStatus: lastClaimTime ? "cooldown_elapsed" : "first_claim",
          lastClaimTime: lastClaimTime?.toISOString(),
          cooldownHours: this.cooldownHours,
        },
      };
    } catch (error) {
      logger.error("Error in time-limit validation", {
        error: error instanceof Error ? error.message : String(error),
        component: "time-limit-validator",
        distributorId: this.distributorId,
      });
      return {
        success: false,
        error: `Time-limit validation failed: ${
          error instanceof Error ? error.message : "Unknown database error"
        }`,
      };
    }
  }
}
