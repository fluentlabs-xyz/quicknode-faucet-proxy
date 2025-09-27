import {
  createWalletClient,
  createPublicClient,
  http,
  type Hex,
  type Address,
  parseUnits,
  isAddress,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { log } from "./logger";
import type { ERC20Config } from './types';

// Minimal ERC20 ABI - only what we need
const ERC20_ABI = [
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "success", type: "bool" }],
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    type: "function",
  },
] as const;


export class ERC20TokenService {
  private readonly walletClient;
  private readonly publicClient;
  private readonly tokenAddress: Address;
  private readonly amount: string;
  private readonly chain: Chain;

  constructor(config: ERC20Config) {
    // Validate token address
    if (!isAddress(config.tokenAddress)) {
      throw new Error(`Invalid token address: ${config.tokenAddress}`);
    }
    this.tokenAddress = config.tokenAddress;
    this.amount = config.amount;

    // Normalize private key to Hex
    const privateKey: Hex = config.privateKey.startsWith("0x")
      ? (config.privateKey as Hex)
      : `0x${config.privateKey}`;

    // Create account from private key
    const account = privateKeyToAccount(privateKey);

    // Setup chain (minimal chain object)
    this.chain = {
      id: config.chainId || 1,
      name: "EVM Chain",
      nativeCurrency: {
        name: "ETH",
        symbol: "ETH",
        decimals: 18,
      },
      rpcUrls: {
        default: {
          http: [config.rpcUrl],
        },
      },
    } as Chain;

    // Setup RPC transport
    const transport = http(config.rpcUrl);

    // Create viem clients with chain
    this.walletClient = createWalletClient({
      account,
      chain: this.chain,
      transport,
    });

    this.publicClient = createPublicClient({
      chain: this.chain,
      transport,
    });

    log.info("ERC20 service initialized", "erc20", undefined, {
      tokenAddress: this.tokenAddress,
      senderAddress: account.address,
      chainId: this.chain.id,
    });
  }

  async transferTokens(
    recipient: string,
    requestId?: string
  ): Promise<{ success: boolean; txHash?: Hex; error?: string }> {
    try {
      // Validate recipient address
      if (!isAddress(recipient)) {
        throw new Error(`Invalid recipient address: ${recipient}`);
      }

      // Get token decimals
      const decimals = await this.publicClient.readContract({
        address: this.tokenAddress,
        abi: ERC20_ABI,
        functionName: "decimals",
      });

      // Convert amount to wei units
      const amountWei = parseUnits(this.amount, Number(decimals));

      log.info("Starting ERC20 transfer", "erc20", requestId, {
        recipient,
        amount: this.amount,
        amountWei: amountWei.toString(),
        decimals: Number(decimals),
      });

      // Send transaction with explicit chain
      const txHash = await this.walletClient.writeContract({
        chain: this.chain,
        address: this.tokenAddress,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [recipient as Address, amountWei],
      });

      // Wait for confirmation (1 block is enough for most cases)
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: 1,
      });

      if (receipt.status === "success") {
        log.info("ERC20 transfer completed", "erc20", requestId, {
          txHash,
          blockNumber: receipt.blockNumber.toString(),
        });
        return { success: true, txHash };
      }

      throw new Error(`Transaction reverted: ${txHash}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";

      log.error("ERC20 transfer failed", "erc20", requestId, errorMessage, {
        recipient,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}
