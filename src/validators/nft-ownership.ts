import { z } from "zod";
import { createPublicClient, http, parseAbi } from "viem";
import type { IValidator, ValidationResult, ClaimRequest } from "../types";
import { logger } from "../logger";

const NFTOwnershipConfigSchema = z.object({
  nftContractAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address"),
  tokenId: z.string().min(1, "Token ID is required"),
  rpcUrl: z.string().url().optional(),
});

const ERC1155_ABI = parseAbi([
  "function balanceOf(address account, uint256 id) view returns (uint256)",
]);

export class NFTOwnershipValidator implements IValidator {
  readonly name = "nft-ownership";
  readonly configSchema = NFTOwnershipConfigSchema;

  private readonly nftContractAddress: string;
  private readonly tokenId: string;
  private readonly rpcUrl?: string;
  private readonly client: ReturnType<typeof createPublicClient>;

  constructor(config: Record<string, unknown>) {
    const parsed = this.configSchema.parse(config);
    this.nftContractAddress = parsed.nftContractAddress;
    this.tokenId = parsed.tokenId;
    this.rpcUrl = parsed.rpcUrl;

    const rpcUrl = this.rpcUrl || process.env.RPC_URL;
    if (!rpcUrl) {
      throw new Error("No RPC URL configured for NFT ownership validation");
    }

    this.client = createPublicClient({
      transport: http(rpcUrl),
    });
  }

  async validate(request: ClaimRequest): Promise<ValidationResult> {
    try {
      const walletAddress =
        (request.externalWallet as `0x${string}`) || (request.walletAddress as string);

      if (!walletAddress) {
        return {
          success: false,
          error: "No wallet address provided for NFT ownership validation",
        };
      }

      if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress as string)) {
        return {
          success: false,
          error: "Invalid wallet address format",
        };
      }

      const balance = await this.client.readContract({
        address: this.nftContractAddress as `0x${string}`,
        abi: ERC1155_ABI,
        functionName: "balanceOf",
        args: [walletAddress as `0x${string}`, BigInt(this.tokenId)],
      });

      if (BigInt(balance) === 0n) {
        return {
          success: false,
          error: `NFT ownership validation failed for address ${walletAddress}. Required token ID ${this.tokenId} not owned.`,
        };
      }

      return {
        success: true,
        data: {
          nftBalance: balance.toString(),
          nftContractAddress: this.nftContractAddress,
          nftTokenId: this.tokenId,
          validatedWallet: walletAddress,
        },
      };
    } catch (error) {
      logger.error("Error validating NFT ownership", {
        error: error instanceof Error ? error.message : String(error),
        component: "nft-ownership-validator",
        contractAddress: this.nftContractAddress,
        tokenId: this.tokenId,
      });
      return {
        success: false,
        error: `NFT ownership validation failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }
}
