import { describe, expect, it, mock } from "bun:test";
import type { Hex } from "viem";
import { ERC20TokenService } from "./erc20";

const BASE_CONFIG = {
  tokenAddress: "0x7A9ab9D0E2ca7472d1339F082F79F2F712F8Ebc9",
  amount: "2000",
  privateKey: `0x${"1".repeat(64)}`,
  rpcUrl: "https://rpc.testnet.fluent.xyz",
  chainId: 20994,
};

const RECIPIENT = "0xC6F7f5AdC7C05d1eBA2eb57Acc0f790556b7A2cA";

function patchClients(
  service: ERC20TokenService,
  opts?: {
    waitForReceipt?: (hash: Hex) => Promise<unknown>;
    decimals?: number;
  },
) {
  const txHash =
    "0x2c1d51cffe652e65af13e0420e366a6e6c9b85882f452ca9c3254d7d834733f3" as Hex;

  (service as any).walletClient = {
    writeContract: mock(async () => txHash),
  };

  (service as any).publicClient = {
    readContract: mock(async () => opts?.decimals ?? 6),
    waitForTransactionReceipt: mock(async () => {
      if (opts?.waitForReceipt) {
        return opts.waitForReceipt(txHash);
      }
      return {
        status: "success",
        blockNumber: 1n,
      };
    }),
    getTransactionReceipt: mock(async () => {
      throw new Error("not found");
    }),
  };

  return txHash;
}

describe("ERC20TokenService confirmation behavior", () => {
  it("reproduces failure when tx hash exists but receipt is not found", async () => {
    const service = new ERC20TokenService(BASE_CONFIG);
    const failedTxHash = patchClients(service, {
      waitForReceipt: async (hash) => {
        throw new Error(
          `Transaction receipt with hash "${hash}" could not be found. The Transaction may not be processed on a block yet.\n\nVersion: viem@2.33.2`,
        );
      },
    });

    const result = await service.transferTokens(RECIPIENT, "req-receipt-miss");

    expect(result.success).toBe(false);
    expect(result.txHash).toBe(failedTxHash);
    expect(result.error).toContain("could not be found");
    expect(result.error).toContain(failedTxHash);
  });

  it("shows intermittent behavior: one transfer confirms, next one times out", async () => {
    const service = new ERC20TokenService(BASE_CONFIG);
    let confirmationAttempt = 0;

    patchClients(service, {
      waitForReceipt: async () => {
        confirmationAttempt += 1;

        if (confirmationAttempt === 1) {
          return {
            status: "success",
            blockNumber: 2n,
          };
        }

        throw new Error(
          'Timed out while waiting for transaction with hash "0x31180597d7bd39e0974c410bd45481f2eee9b65216d91410518c48a2e51ec3aa" to be confirmed.\n\nVersion: viem@2.33.2',
        );
      },
    });

    const first = await service.transferTokens(RECIPIENT, "req-1");
    const second = await service.transferTokens(RECIPIENT, "req-2");

    expect(first.success).toBe(true);
    expect(second.success).toBe(false);
    expect(second.error).toContain("Timed out while waiting for transaction");
  });

  it("serializes concurrent sends for the same signer", async () => {
    const service = new ERC20TokenService(BASE_CONFIG);
    const txHashes = [
      "0x1111111111111111111111111111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222222222222222222222222222",
    ] as const satisfies readonly Hex[];
    let writeCount = 0;
    let inFlightConfirmations = 0;
    let maxInFlightConfirmations = 0;

    (service as any).walletClient = {
      writeContract: mock(async () => {
        const idx = writeCount;
        writeCount += 1;
        return txHashes[idx] ?? txHashes[1];
      }),
    };

    (service as any).publicClient = {
      readContract: mock(async () => 6),
      waitForTransactionReceipt: mock(async () => {
        inFlightConfirmations += 1;
        maxInFlightConfirmations = Math.max(
          maxInFlightConfirmations,
          inFlightConfirmations,
        );
        await new Promise((resolve) => setTimeout(resolve, 20));
        inFlightConfirmations -= 1;

        return {
          status: "success",
          blockNumber: 3n,
        };
      }),
      getTransactionReceipt: mock(async ({ hash }: { hash: Hex }) => ({
        status: "success",
        blockNumber: 3n,
        hash,
      })),
    };

    const [first, second] = await Promise.all([
      service.transferTokens(RECIPIENT, "concurrent-1"),
      service.transferTokens(RECIPIENT, "concurrent-2"),
    ]);

    expect(maxInFlightConfirmations).toBe(1);
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(writeCount).toBe(2);
  });

  it("stress: serializes 100 parallel transfers for the same signer", async () => {
    const service = new ERC20TokenService(BASE_CONFIG);
    const totalTransfers = 100;
    let writeCount = 0;
    let inFlightConfirmations = 0;
    let maxInFlightConfirmations = 0;

    (service as any).walletClient = {
      writeContract: mock(async () => {
        writeCount += 1;
        const suffix = writeCount.toString(16).padStart(64, "0");
        return `0x${suffix}` as Hex;
      }),
    };

    (service as any).publicClient = {
      readContract: mock(async () => 6),
      waitForTransactionReceipt: mock(async () => {
        inFlightConfirmations += 1;
        maxInFlightConfirmations = Math.max(
          maxInFlightConfirmations,
          inFlightConfirmations
        );

        await new Promise((resolve) => setTimeout(resolve, 2));
        inFlightConfirmations -= 1;

        return {
          status: "success",
          blockNumber: 10n,
        };
      }),
      getTransactionReceipt: mock(async ({ hash }: { hash: Hex }) => ({
        status: "success",
        blockNumber: 10n,
        hash,
      })),
    };

    const results = await Promise.all(
      Array.from({ length: totalTransfers }, (_, idx) =>
        service.transferTokens(RECIPIENT, `stress-${idx + 1}`)
      )
    );

    expect(maxInFlightConfirmations).toBe(1);
    expect(writeCount).toBe(totalTransfers);
    expect(results.every((r) => r.success)).toBe(true);
  });
});
