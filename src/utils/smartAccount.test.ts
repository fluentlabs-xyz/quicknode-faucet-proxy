import { describe, expect, it } from "bun:test";
import { deriveKernelAddress } from "./smartAccount";

// Pinned against fluent-connect-sdk packages/react/src/zerodevSession.ts:455-468.
// If this breaks, the frontend and the faucet no longer agree on where a user's
// funds go - do not update the expected value without checking the SDK first.
describe("deriveKernelAddress", () => {
  it("derives the Kernel v0.3.3 address the Fluent Connect widget shows", async () => {
    const address = await deriveKernelAddress(
      "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      { kernelVersion: "0.3.3", index: 0 },
    );

    expect(address).toBe("0xCfC4C807Ed404ae1a65fbe0EdaA09EF002E75838");
  });

  it("rejects a malformed signer instead of deriving an unreachable address", async () => {
    for (const signer of ["", "0x", "0xdeadbeef", "not-an-address"]) {
      expect(
        deriveKernelAddress(signer, { kernelVersion: "0.3.3", index: 0 }),
      ).rejects.toThrow("Invalid signer address");
    }
  });
});
