import { createPublicClient, http, parseAbi } from "viem";
import { config } from "../config";

const client = createPublicClient({
  transport: http(config.rpcUrl),
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

export async function verifyParaWalletAddress(
  address: string,
  paraSecretKey: string,
  verifyUrl: string
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
    return null;
  }

  if (!resp.ok) {
    const msg = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${msg}`);
  }

  return resp.json();
}
