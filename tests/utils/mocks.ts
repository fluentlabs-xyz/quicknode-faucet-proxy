import type { ClaimRequest, ValidationResult } from "../../src/types";

export const mockClaimRequest = (): ClaimRequest => ({
  clientIp: "192.168.1.1",
  visitorId: "test-visitor-123",
  token: "mock-jwt-token",
});

export const mockParaJwtToken = () => {
  const header = { alg: "RS256", typ: "JWT", kid: "test-key-id" };
  const payload = {
    data: {
      userId: "test-user-123",
      wallets: [
        {
          id: "wallet-1",
          type: "EVM",
          address: "0x742d35Cc6635C0532925a3b8D000b5f6c7fdB3a0",
          publicKey: "0xtest",
        },
      ],
      externalWallets: [
        {
          id: "ext-wallet-1",
          address: "0x1234567890123456789012345678901234567890",
          type: "EVM",
          isVerified: true,
        },
      ],
    },
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    sub: "test-user",
    aud: "test-audience",
  };
  
  return `${btoa(JSON.stringify(header))}.${btoa(JSON.stringify(payload))}.test-signature`;
};

export const mockValidationResult = (success = true): ValidationResult => ({
  success,
  error: success ? undefined : "Mock validation error",
  data: success ? { walletAddress: "0x1234567890123456789012345678901234567890" } : undefined,
});

export const mockFetch = (response: any, ok = true) => {
  const mockResponse = {
    ok,
    status: ok ? 200 : 400,
    statusText: ok ? "OK" : "Bad Request",
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(JSON.stringify(response)),
  };
  return () => Promise.resolve(mockResponse);
};

