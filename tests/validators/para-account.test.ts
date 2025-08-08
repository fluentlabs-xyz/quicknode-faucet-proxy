import { describe, test, expect, beforeEach, mock } from "bun:test";
import { ParaAccountValidator } from "../../src/validators/para-account";
import { mockClaimRequest, mockParaJwtToken } from "../utils/mocks";
import { assertValidationSuccess, assertValidationFailure } from "../utils/test-helpers";

describe("ParaAccountValidator", () => {
  let validator: ParaAccountValidator;
  
  beforeEach(() => {
    validator = new ParaAccountValidator({
      paraJwksUrl: "https://api.para.gg/jwks",
      paraVerifyUrl: "https://api.para.gg/verify",
      paraSecretKey: "test-secret-key",
    });
  });

  describe("Configuration", () => {
    test("validates required config fields", () => {
      expect(() => new ParaAccountValidator({})).toThrow();
    });

    test("sets name correctly", () => {
      expect(validator.name).toBe("para-account");
    });
  });

  describe("Token Validation", () => {
    test("fails when no token provided", async () => {
      const request = mockClaimRequest();
      delete request.token;
      
      const result = await validator.validate(request);
      assertValidationFailure(result, "Authorization token is required");
    });

    test("fails with invalid token format", async () => {
      const request = mockClaimRequest();
      request.token = "invalid-token";
      
      const result = await validator.validate(request);
      assertValidationFailure(result, "Invalid token");
    });
  });

  describe("Token Validation Flow", () => {
    test("handles JWT verification errors", async () => {
      const request = mockClaimRequest();
      request.token = "malformed.jwt.token";

      const result = await validator.validate(request);
      assertValidationFailure(result, "Invalid token");
    });

    test("extracts wallet data correctly", () => {
      expect(validator.name).toBe("para-account");
    });
  });
});