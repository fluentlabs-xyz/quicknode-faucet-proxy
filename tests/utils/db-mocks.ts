import { mock } from "bun:test";
import type { ClaimRecord } from "../../src/types";

export const createMockDatabase = () => ({
  checkExistingClaim: mock(async (wallet: string, distributorId: string) => false),
  getLastClaimTime: mock(async (wallet: string, distributorId: string) => null),
  insertClaim: mock(async (claim: any) => undefined),
  hasClaimedRecently: mock(async (distributorId: string, visitorId: string, hours: number) => false),
  hasClaimedBefore: mock(async (distributorId: string, visitorId: string) => false),
  recordClaim: mock(async (record: ClaimRecord) => undefined),
  getClaimHistory: mock(async (distributorId: string, limit?: number) => []),
  close: mock(async () => undefined),
});

export const mockClaimRecord = (): ClaimRecord => ({
  distributorId: "test-distributor",
  embeddedWallet: "0x742d35Cc6635C0532925a3b8D000b5f6c7fdB3a0",
  externalWallet: "0x1234567890123456789012345678901234567890",
  visitorId: "test-visitor-123",
  ip: "192.168.1.1",
  txId: "0xtest-transaction-123",
  amount: 0.1,
});

export const setupDatabaseMocks = () => {
  const mocks = createMockDatabase();
  
  mock.module("../../src/database", () => ({
    queries: mocks,
    ensureDatabase: mock(async () => undefined),
  }));
  
  return mocks;
};