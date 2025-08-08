import { describe, test, expect, beforeEach, mock } from "bun:test";
import { Distributor } from "../../src/distributor";
import type { IValidator } from "../../src/types";
import { mockClaimRequest, mockValidationResult } from "../utils/mocks";
import { setupDatabaseMocks } from "../utils/db-mocks";
import { assertValidationSuccess, assertValidationFailure } from "../utils/test-helpers";

describe("Claim Flow Integration", () => {
  let distributor: Distributor;
  let mockValidator: IValidator;
  let dbMocks: any;

  beforeEach(() => {
    dbMocks = setupDatabaseMocks();
    
    mockValidator = {
      name: "test-validator",
      validate: mock(() => Promise.resolve(mockValidationResult(true))),
    };

    mock.module("../../src/quicknode", () => ({
      quickNodeService: {
        submitClaim: mock(() => Promise.resolve({
          success: true,
          transactionId: "0xtest-tx-123",
          amount: 0.1,
        })),
      },
    }));

    distributor = new Distributor({
      id: "test-dist",
      name: "Test Distributor",
      path: "/test",
      distributorId: "test-id-123",
      distributorApiKey: "test-api-key",
      dripAmount: 0.1,
      validators: [mockValidator],
    });
  });

  describe("Request Processing", () => {
    test("successful claim flow", async () => {
      const request = mockClaimRequest();
      request.walletAddress = "0x1234567890123456789012345678901234567890";
      
      const result = await distributor.processClaim(request);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.transactionId).toBe("0xtest-tx-123");
      }
      expect(dbMocks.insertClaim).toHaveBeenCalled();
    });

    test("validation failure stops claim", async () => {
      mockValidator.validate = mock(() => Promise.resolve({
        success: false,
        error: "Validation failed"
      }));
      
      const request = mockClaimRequest();
      const result = await distributor.processClaim(request);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Validation failed");
      }
      expect(dbMocks.insertClaim).not.toHaveBeenCalled();
    });
  });

  describe("Multi-Validator Flow", () => {
    test("all validators run on success", async () => {
      const validator1 = {
        name: "validator-1",
        validate: mock(() => Promise.resolve({
          success: true,
          data: { walletAddress: "0x1234567890123456789012345678901234567890" }
        })),
      };
      
      const validator2 = {
        name: "validator-2",
        validate: mock(() => Promise.resolve({ success: true })),
      };

      const multiDist = new Distributor({
        id: "multi-test",
        name: "Multi Test",
        path: "/multi",
        distributorId: "multi-123",
        distributorApiKey: "test-key",
        dripAmount: 0.1,
        validators: [validator1, validator2],
      });

      const request = mockClaimRequest();
      await multiDist.processClaim(request);

      expect(validator1.validate).toHaveBeenCalled();
      expect(validator2.validate).toHaveBeenCalled();
    });
  });
});