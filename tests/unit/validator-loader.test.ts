import { describe, test, expect } from "bun:test";
import { TimeLimitValidator } from "../../src/validators/time-limit";
import { OnceOnlyValidator } from "../../src/validators/once-only";
import { ParaAccountValidator } from "../../src/validators/para-account";

describe("Validator Loader", () => {
  test("TimeLimitValidator requires distributorId", () => {
    expect(() => new TimeLimitValidator({})).toThrow();
  });

  test("TimeLimitValidator validates cooldown range", () => {
    expect(() => new TimeLimitValidator({ 
      distributorId: "test", 
      cooldownHours: 0 
    })).toThrow("Cooldown must be at least 1 hour");
    
    expect(() => new TimeLimitValidator({ 
      distributorId: "test", 
      cooldownHours: 10000 
    })).toThrow("Cooldown cannot exceed 1 year");
  });

  test("OnceOnlyValidator requires distributorId", () => {
    expect(() => new OnceOnlyValidator({})).toThrow();
    
    const validator = new OnceOnlyValidator({ distributorId: "test-123" });
    expect(validator.name).toBe("once-only");
  });

  test("ParaAccountValidator requires URLs and secret", () => {
    expect(() => new ParaAccountValidator({})).toThrow();
    
    expect(() => new ParaAccountValidator({
      paraJwksUrl: "https://api.para.gg/jwks",
      paraVerifyUrl: "https://api.para.gg/verify",
      paraSecretKey: "test-secret",
    })).not.toThrow();
  });
});