import { expect } from "bun:test";
import type { ValidationResult } from "../../src/types";

export const assertValidationSuccess = (result: ValidationResult) => {
  expect(result.success).toBe(true);
  expect(result.error).toBeUndefined();
};

export const assertValidationFailure = (result: ValidationResult, expectedError?: string) => {
  expect(result.success).toBe(false);
  expect(result.error).toBeDefined();
  if (expectedError) {
    expect(result.error).toContain(expectedError);
  }
};

export const createMockEnvironment = () => {
  const originalEnv = { ...process.env };
  
  return {
    set: (key: string, value: string) => {
      process.env[key] = value;
    },
    restore: () => {
      Object.keys(process.env).forEach(key => {
        if (!(key in originalEnv)) {
          delete process.env[key];
        } else {
          process.env[key] = originalEnv[key];
        }
      });
    },
  };
};

export const waitForAsync = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms));