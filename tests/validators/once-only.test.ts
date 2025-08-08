import { describe, test, expect, beforeEach, mock } from "bun:test";
import { OnceOnlyValidator } from "../../src/validators/once-only";
import { mockClaimRequest } from "../utils/mocks";
import { assertValidationSuccess, assertValidationFailure } from "../utils/test-helpers";

describe("OnceOnlyValidator", () => {
  let validator: OnceOnlyValidator;
  let mockQueries: any;

  beforeEach(() => {
    mockQueries = {
      checkExistingClaim: mock(() => Promise.resolve(false)),
    };
    
    mock.module("../../src/database", () => ({
      queries: mockQueries,
    }));

    validator = new OnceOnlyValidator({ distributorId: "test-dist-123" });
  });

  describe("Configuration", () => {
    test("requires distributorId", () => {
      expect(() => new OnceOnlyValidator({})).toThrow();
    });

    test("initializes with distributorId", () => {
      expect(validator.name).toBe("once-only");
    });
  });

  describe("Claim Validation", () => {
    test("allows first-time claim", async () => {
      mockQueries.checkExistingClaim.mockResolvedValue(false);
      
      const request = mockClaimRequest();
      request.walletAddress = "0x1234567890123456789012345678901234567890";
      
      const result = await validator.validate(request);
      assertValidationSuccess(result);
    });

    test("blocks duplicate claims", async () => {
      mockQueries.checkExistingClaim.mockResolvedValue(true);
      
      const request = mockClaimRequest();
      request.walletAddress = "0x1234567890123456789012345678901234567890";
      
      const result = await validator.validate(request);
      assertValidationFailure(result, "already claimed");
    });

    test("handles database errors", async () => {
      mockQueries.checkExistingClaim.mockRejectedValue(new Error("DB error"));
      
      const request = mockClaimRequest();
      request.walletAddress = "0x1234567890123456789012345678901234567890";
      
      const result = await validator.validate(request);
      assertValidationFailure(result, "Once-only validation failed");
    });
  });

  describe("Edge Cases", () => {
    test("handles missing wallet address", async () => {
      const request = mockClaimRequest();
      delete request.walletAddress;
      
      const result = await validator.validate(request);
      assertValidationFailure(result, "No wallet address provided");
    });

    test("handles empty wallet address", async () => {
      const request = mockClaimRequest();
      request.walletAddress = "";
      
      const result = await validator.validate(request);
      assertValidationFailure(result, "No wallet address provided");
    });
  });
});