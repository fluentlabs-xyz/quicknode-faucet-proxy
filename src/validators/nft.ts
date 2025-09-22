import { z } from "zod";
import { createPublicClient, http, parseAbi } from "viem";
import { log } from "../logger";

const ERC1155_ABI = parseAbi([
  "function balanceOf(address account, uint256 id) view returns (uint256)",
]);

const NFTConfigSchema = z.object({
  contractAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/i, "Invalid contract address"),
  tokenId: z.string().min(1, "Token ID is required"),
  rpcUrl: z.string().url("Invalid RPC URL"),
});

export class NFTOwnershipValidator {
  readonly name = "nft-ownership";

  private contractAddress: string;
  private tokenId: string;
  private rpcUrl: string;
  private client?: ReturnType<typeof createPublicClient>;

  constructor(config: unknown) {
    const parsed = NFTConfigSchema.parse(config);
    this.contractAddress = parsed.contractAddress;
    this.tokenId = parsed.tokenId;
    this.rpcUrl = parsed.rpcUrl;
  }

  async validate(walletAddress: string, requestId?: string): Promise<void> {
    // Validate wallet format
    if (!/^0x[a-fA-F0-9]{40}$/i.test(walletAddress)) {
      throw new Error("Invalid wallet address format");
    }

    // Initialize client if needed
    if (!this.client) {
      this.client = createPublicClient({
        transport: http(this.rpcUrl),
      });
    }

    try {
      const balance = await this.client.readContract({
        address: this.contractAddress as `0x${string}`,
        abi: ERC1155_ABI,
        functionName: "balanceOf",
        args: [walletAddress as `0x${string}`, BigInt(this.tokenId)],
      });

      if (BigInt(balance) === 0n) {
        throw new Error(
          `NFT ownership validation failed. Token ID ${this.tokenId} not owned.`
        );
      }

      if (requestId) {
        log.debug("NFT ownership validated", "nft-ownership", requestId, {
          walletAddress,
          tokenId: this.tokenId,
          balance: balance.toString(),
        });
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("NFT ownership")) {
        throw error;
      }

      throw new Error(
        `NFT validation failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}
