import { z } from "zod";
import { queries } from "../db";
import { log } from "../logger";

// ===== CONFIG SCHEMA =====
const ConfigSchema = z.object({
  period: z.enum(["hour", "day", "week", "month", "year"]).default("week"),
  maxClaims: z.number().int().min(1).max(10).default(1),
  cooldownHours: z.number().min(1).max(168).default(24),
});

// ===== VALIDATOR =====
export class TimeLimitValidator {
  readonly name = "time-limit";

  private readonly timeWindow: number;
  private readonly maxClaims: number;
  private readonly cooldownHours: number;

  constructor(config: unknown) {
    const parsed = ConfigSchema.parse(config);
    this.maxClaims = parsed.maxClaims;
    this.cooldownHours = parsed.cooldownHours;
    this.timeWindow = this.getTimeWindow(parsed.period);
  }

  private getTimeWindow(period: string): number {
    switch (period) {
      case "hour":
        return 60 * 60 * 1000;
      case "day":
        return 24 * 60 * 60 * 1000;
      case "week":
        return 7 * 24 * 60 * 60 * 1000;
      case "month":
        return 30 * 24 * 60 * 60 * 1000;
      case "year":
        return 365 * 24 * 60 * 60 * 1000;
      default:
        throw new Error(`Invalid period: ${period}`);
    }
  }

  async validate(
    walletAddress: string,
    distributorId: string,
    requestId?: string
  ): Promise<void> {
    const periodStart = new Date(Date.now() - this.timeWindow);
    const recentClaims = await queries.getRecentClaims(
      walletAddress,
      distributorId,
      periodStart
    );

    // No claims this period - OK
    if (recentClaims.length === 0) {
      if (requestId) {
        log.debug("First claim this period", "time-limit", requestId);
      }
      return;
    }

    // Check limit
    if (recentClaims.length >= this.maxClaims) {
      const oldestClaim = recentClaims[recentClaims.length - 1];
      if (!oldestClaim) return;

      const oldestTime = new Date(oldestClaim.created_at).getTime();
      const nextSlotTime = oldestTime + this.timeWindow;
      const hoursUntilSlot = Math.ceil(
        (nextSlotTime - Date.now()) / (60 * 60 * 1000)
      );

      if (hoursUntilSlot > 0) {
        throw new Error(
          `Limit reached (${recentClaims.length}/${this.maxClaims}). ` +
            `Next slot in ${hoursUntilSlot}h`
        );
      }
    }

    // Check cooldown
    const lastClaim = recentClaims[0];
    if (!lastClaim) return;

    const hoursSinceLastClaim =
      (Date.now() - new Date(lastClaim.created_at).getTime()) /
      (60 * 60 * 1000);

    if (hoursSinceLastClaim < this.cooldownHours) {
      const hoursRemaining = Math.ceil(
        this.cooldownHours - hoursSinceLastClaim
      );
      throw new Error(`Cooldown: wait ${hoursRemaining}h`);
    }

    if (requestId) {
      log.debug("Time limit passed", "time-limit", requestId, {
        claimsThisPeriod: recentClaims.length,
        maxClaims: this.maxClaims,
      });
    }
  }
}

// ===== ONCE-ONLY VALIDATOR =====
export class OnceOnlyValidator {
  readonly name = "once-only";

  async validate(
    walletAddress: string,
    distributorId: string,
    requestId?: string
  ): Promise<void> {
    const hasClaimed = await queries.checkExistingClaim(
      walletAddress,
      distributorId
    );

    if (hasClaimed) {
      throw new Error("Already claimed. Only one claim allowed per wallet.");
    }

    if (requestId) {
      log.debug("Once-only check passed", "once-only", requestId);
    }
  }
}
