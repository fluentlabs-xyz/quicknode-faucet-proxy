import { getKernelAddressFromECDSA } from "@zerodev/ecdsa-validator";
import { getEntryPoint } from "@zerodev/sdk/constants";
import { createPublicClient, http, isAddress, type Address } from "viem";
import type { SmartAccountConfig } from "../types";

// EntryPoint 0.7 derives the address purely from constants - CREATE2 over the
// account implementation address. The client is required by the signature but
// never dialled; only the 0.6 path reads initCodeHash from the factory.
const offlineClient = createPublicClient({
  transport: http("http://127.0.0.1:1"),
});

export async function deriveKernelAddress(
  signer: string,
  config: SmartAccountConfig,
): Promise<Address> {
  // CREATE2 hashes whatever it is given - an unvalidated signer would derive a
  // well-formed address that no one controls, and payout would succeed.
  if (!isAddress(signer)) {
    throw new Error(`Invalid signer address: ${signer}`);
  }

  return await getKernelAddressFromECDSA({
    publicClient: offlineClient,
    eoaAddress: signer,
    index: BigInt(config.index),
    entryPoint: getEntryPoint("0.7"),
    kernelVersion: config.kernelVersion,
  });
}
