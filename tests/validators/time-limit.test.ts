import { describe, test, expect, beforeEach, mock } from "bun:test";
import { TimeLimitValidator } from "../../src/validators/time-limit";
import { mockClaimRequest } from "../utils/mocks";
import { assertValidationSuccess, assertValidationFailure } from "../utils/test-helpers";

describe("TimeLimitValidator", () => {
  let validator: TimeLimitValidator;
  let mockQueries: any;

  beforeEach(() => {
    mockQueries = {
      getLastClaimTime: mock(() => Promise.resolve(null)),
    };
    
    mock.module("../../src/database", () => ({
      queries: mockQueries,
    }));

    validator = new TimeLimitValidator({
      distributorId: "test-dist-123",
      cooldownHours: 24,
    });
  });

  describe("Configuration", () => {
    test("requires distributorId", () => {
      expect(() => new TimeLimitValidator({})).toThrow();
    });

    test("accepts custom cooldown hours", () => {
      const customValidator = new TimeLimitValidator({ 
        distributorId: "test-123", 
        cooldownHours: 12 
      });
      expect(customValidator.name).toBe("time-limit");
    });
  });

  describe("Cooldown Logic", () => {
    test("allows claim when no recent claims", async () => {
      mockQueries.getLastClaimTime.mockResolvedValue(null);
      
      const request = mockClaimRequest();
      request.walletAddress = "0x1234567890123456789012345678901234567890";
      
      const result = await validator.validate(request);
      assertValidationSuccess(result);
    });

    test("blocks claim when recent claim exists", async () => {
      const recentTime = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
      mockQueries.getLastClaimTime.mockResolvedValue(recentTime);
      
      const request = mockClaimRequest();
      request.walletAddress = "0x1234567890123456789012345678901234567890";
      
      const result = await validator.validate(request);
      assertValidationFailure(result, "Cooldown period active");
    });

    test("handles database errors gracefully", async () => {
      mockQueries.getLastClaimTime.mockRejectedValue(new Error("DB connection failed"));
      
      const request = mockClaimRequest();
      request.walletAddress = "0x1234567890123456789012345678901234567890";
      
      const result = await validator.validate(request);
      assertValidationFailure(result, "Time-limit validation failed");
    });
  });

  describe("Edge Cases", () => {
    test("handles missing wallet address", async () => {
      const request = mockClaimRequest();
      delete request.walletAddress;
      
      const result = await validator.validate(request);
      assertValidationFailure(result, "No wallet address provided");
    });

    test("validates minimum cooldown hours", () => {
      expect(() => new TimeLimitValidator({ 
        distributorId: "test-123", 
        cooldownHours: 0 
      })).toThrow("Cooldown must be at least 1 hour");
    });
  });
});