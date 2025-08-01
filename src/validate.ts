import { createPublicClient, http, parseAbi } from "viem";
import { RPC_URL } from "./config";

const client = createPublicClient({
  transport: http(RPC_URL),
});

const ERC1155_ABI = parseAbi([
  "function balanceOf(address account, uint256 id) view returns (uint256)",
]);

export async function validateNFTOwnership(
  userAddress: string,
  nftContractAddress: string,
  tokenId: string
): Promise<boolean> {
  try {
    const balance = await client.readContract({
      address: nftContractAddress as `0x${string}`,
      abi: ERC1155_ABI,
      functionName: "balanceOf",
      args: [userAddress as `0x${string}`, BigInt(tokenId)],
    });

    return BigInt(balance) > 0n;
  } catch (e) {
    console.error("Error validating NFT ownership:", e);
    return false;
  }
}

/**
 * Checks if the given address belongs to a Para wallet (project-level verification).
 * @param address Wallet address to verify.
 * @param paraSecretKey Your Para server (secret) API key.
 * @param verifyUrl Para wallet verification endpoint URL.
 * @returns The verified wallet object if found, or null if not found.
 * @throws Error if the API call fails for reasons other than "not found".
 */
export async function verifyParaWalletAddress(
  address: string,
  paraSecretKey: string,
  verifyUrl: string = "https://api.beta.getpara.com/wallets/verify"
): Promise<any | null> {
  const resp = await fetch(verifyUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-external-api-key": paraSecretKey,
    },
    body: JSON.stringify({ address }),
  });

  if (resp.status === 404) {
    // Wallet not found, address does not belong to project
    return null;
  }
  if (!resp.ok) {
    const msg = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${msg}`);
  }

  // Wallet found, parse and return response
  return await resp.json();
}
