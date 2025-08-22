import type { ClaimRequest, ClaimResult, GlobalConfig } from "./types";
import { quickNodeService } from "./quicknode";
import { queries } from "./db";
import { log } from "./logger";
import { validateParaJwt } from "./utils/jwtValidator";
import { createPublicClient, http, parseAbi } from "viem";
import z from "zod";

export async function createDistributors(
  configPath: string
): Promise<Map<string, Distributor>> {
  const distributors = new Map<string, Distributor>();

  const configFile = await Bun.file(configPath).text();
  const config: GlobalConfig = JSON.parse(
    configFile.replace(/\$\{([^}]+)\}/g, (_, key) => Bun.env[key] || "")
  );

  // Now path is the key in config.distributors
  for (const [path, distConfig] of Object.entries(config.distributors)) {
    const distributor = new Distributor({
      path, // path from the key
      distributorId: distConfig.distributorId,
      distributorApiKey: distConfig.distributorApiKey,
      dripAmount: distConfig.dripAmount,
      validatorConfigs: distConfig.validators,
    });

    // Use path as the key in the Map for routing
    distributors.set(path, distributor);
  }

  log.info("Distributors initialized", "config", undefined, {
    count: distributors.size,
    paths: Array.from(distributors.keys()),
  });

  return distributors;
}

export interface DistributorConfig {
  path: string;
  distributorId: string;
  distributorApiKey: string;
  dripAmount: number;
  validatorConfigs?: Record<string, Record<string, unknown>>;
}

const ERC1155_ABI = parseAbi([
  "function balanceOf(address account, uint256 id) view returns (uint256)",
]);

const ParaConfigSchema = z.object({
  paraJwksUrl: z.url("Para JWKS URL must be a valid URL"),
  paraVerifyUrl: z.url("Para Verify URL must be a valid URL"),
  paraSecretKey: z.string().min(1, "Para Secret Key is required"),
});

const NFTConfigSchema = z.object({
  contractAddress: z
    .string()
    .regex(
      /^0x[a-fA-F0-9]{40}$/,
      "Contract address must be a valid Ethereum address"
    ),
  tokenId: z.string().min(1, "Token ID is required"),
  rpcUrl: z.url("RPC URL must be a valid URL"),
});

const WeeklyLimitSchema = z
  .object({
    maxClaimsPerWeek: z.number().int().min(1).max(10).default(3),
    cooldownHours: z.number().min(1).max(168).default(24),
  })
  .refine(
    (data) => {
      const minTimeBetweenAllClaims =
        data.cooldownHours * (data.maxClaimsPerWeek - 1);
      return minTimeBetweenAllClaims <= 168;
    },
    {
      message:
        "Invalid configuration: cooldown * (maxClaims-1) cannot exceed 168 hours",
    }
  );

export class Distributor {
  // Para config - MANDATORY for security
  private paraConfig?: {
    paraJwksUrl: string;
    paraVerifyUrl: string;
    paraSecretKey: string;
  };

  // Optional validator configs
  private onceOnlyEnabled: boolean = false;

  private nftConfig?: {
    contractAddress: string;
    tokenId: string;
    rpcUrl: string;
  };

  private weeklyLimitConfig?: {
    maxClaimsPerWeek: number;
    cooldownHours: number;
  };

  // NFT client (lazy initialized)
  private nftClient?: ReturnType<typeof createPublicClient>;

  constructor(private readonly cfg: DistributorConfig) {
    this.parseValidatorConfigs();

    // Para validation is MANDATORY - fail fast if not configured
    if (!this.paraConfig) {
      throw new Error(
        `Para validation is required for distributor "${cfg.path}". ` +
          `Security requires wallet addresses from verified JWT tokens.`
      );
    }

    log.info("Distributor initialized", "distributor", undefined, {
      path: cfg.path,
      paraEnabled: !!this.paraConfig,
      onceOnlyEnabled: this.onceOnlyEnabled,
      weeklyLimitEnabled: !!this.weeklyLimitConfig,
      nftEnabled: !!this.nftConfig,
    });
  }

  get path() {
    return this.cfg.path;
  }

  get id() {
    return this.cfg.distributorId;
  }

  private parseValidatorConfigs(): void {
    if (!this.cfg.validatorConfigs) {
      return;
    }

    const configs = this.cfg.validatorConfigs;

    // Parse Para config (mandatory)
    if (configs["para-account"]) {
      this.paraConfig = ParaConfigSchema.parse(configs["para-account"]);
    }

    // Parse once-only config
    if (configs["once-only"]) {
      this.onceOnlyEnabled = true;
    }

    // Parse NFT config
    if (configs["nft-ownership"]) {
      this.nftConfig = NFTConfigSchema.parse(configs["nft-ownership"]);
    }

    // Parse weekly-limit config
    if (configs["weekly-limit"]) {
      this.weeklyLimitConfig = WeeklyLimitSchema.parse(configs["weekly-limit"]);
    }
  }

  async parseRequestFromBody(
    body: unknown,
    headers: Headers
  ): Promise<ClaimRequest> {
    const rawBody = body as Record<string, unknown>;

    if (!rawBody?.visitorId) {
      throw new Error("Missing visitorId");
    }

    // Extract JWT token from Authorization header
    const authHeader = headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : undefined;

    if (!token) {
      throw new Error("Authorization token is required");
    }

    return {
      visitorId: rawBody.visitorId as string,
      clientIp:
        headers.get("cf-connecting-ip") ||
        headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        headers.get("x-real-ip") ||
        "",
      token,
      ...rawBody,
    };
  }

  async processClaim(
    request: ClaimRequest,
    requestId?: string
  ): Promise<ClaimResult> {
    try {
      // Step 1: Para validation - extract wallet addresses from JWT
      const { embeddedWallet, externalWallet } = await this.validateParaAccount(
        request.token as string,
        requestId
      );

      // Step 2: Check once-only constraint if enabled
      if (this.onceOnlyEnabled) {
        await this.validateOnceOnly(externalWallet, requestId);
      }

      // Step 3: Check weekly limit if enabled
      if (this.weeklyLimitConfig) {
        await this.validateWeeklyLimit(externalWallet, requestId);
      }

      // Step 4: Check NFT ownership if configured
      if (this.nftConfig) {
        await this.validateNftOwnership(externalWallet, requestId);
      }

      // Step 5: Submit claim to QuickNode
      const response = await quickNodeService.submitClaim(
        this.cfg.distributorApiKey,
        {
          address: embeddedWallet,
          ip: request.clientIp,
          visitorId: request.visitorId,
        },
        requestId
      );

      if (!response.success) {
        throw new Error(response.message || "Claim rejected by QuickNode");
      }

      // Step 6: Record successful claim in database
      await queries.insertClaim({
        distributorId: this.cfg.distributorId,
        embeddedWallet,
        externalWallet,
        visitorId: request.visitorId,
        ip: request.clientIp,
        txId: response.transactionId || null,
        amount: this.cfg.dripAmount,
      });

      return {
        success: true,
        transactionId: response.transactionId || "",
        amount: this.cfg.dripAmount,
        message: "Claim processed successfully",
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Claim processing failed";

      if (requestId) {
        log.info("Claim failed", "distributor", requestId, { error: message });
      }

      return { success: false, error: message };
    }
  }

  /**
   * Validate Para JWT and extract wallet addresses
   * This is MANDATORY - we only trust wallets from verified JWT tokens
   */
  private async validateParaAccount(
    token: string | undefined,
    requestId?: string
  ): Promise<{ embeddedWallet: string; externalWallet: string }> {
    if (!token) {
      throw new Error("Authorization token is required");
    }

    if (!this.paraConfig) {
      throw new Error("Para validation not configured but is required");
    }

    // Validate JWT signature and expiration
    const jwtResult = await validateParaJwt(token, this.paraConfig.paraJwksUrl);

    if (!jwtResult.valid) {
      throw new Error(`Invalid token: ${jwtResult.error}`);
    }

    // Extract wallet addresses from JWT payload
    const payload = jwtResult.payload;
    const data = payload.data;

    // Get embedded wallet (Para wallet)
    const embeddedWallet = data.wallets?.[0]?.address;

    // Get external wallet
    const externalWallet = data.externalWallets?.[0]?.address;

    if (!embeddedWallet) {
      throw new Error("No embedded wallet addresses found in Para token");
    }

    if (!externalWallet) {
      throw new Error("No external wallet addresses found in Para token");
    }

    // Verify with Para project API
    await this.verifyParaProject(embeddedWallet);

    if (requestId) {
      log.debug("Para validation successful", "distributor", requestId, {
        embeddedWallet,
        externalWallet,
        userId: data.userId,
      });
    }

    return { embeddedWallet, externalWallet };
  }

  /**
   * Verify wallet with Para project API
   */
  private async verifyParaProject(address: string): Promise<void> {
    if (!this.paraConfig) return;

    const resp = await fetch(this.paraConfig.paraVerifyUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-external-api-key": this.paraConfig.paraSecretKey,
      },
      body: JSON.stringify({ address }),
    });

    if (resp.status === 404) {
      // Wallet doesn't exist yet - that's ok
      return;
    }

    if (!resp.ok) {
      throw new Error(
        `Para wallet verification failed: ${resp.status} ${resp.statusText}`
      );
    }
  }

  /**
   * Check if wallet has already claimed (once-only validation)
   */
  private async validateOnceOnly(
    walletAddress: string,
    requestId?: string
  ): Promise<void> {
    const existingClaim = await queries.checkExistingClaim(
      walletAddress,
      this.cfg.distributorId
    );

    if (existingClaim) {
      throw new Error(
        `This wallet has already claimed from this faucet. Only one claim is allowed per wallet.`
      );
    }

    if (requestId) {
      log.debug("Once-only validation passed", "distributor", requestId);
    }
  }

  /**
   * Verify NFT ownership for the wallet
   */
  private async validateNftOwnership(
    walletAddress: string,
    requestId?: string
  ): Promise<void> {
    if (!this.nftConfig) return;

    // Validate wallet address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      throw new Error("Invalid wallet address format for NFT verification");
    }

    // Initialize NFT client if needed
    if (!this.nftClient) {
      this.nftClient = createPublicClient({
        transport: http(this.nftConfig.rpcUrl),
      });
    }

    try {
      const balance = await this.nftClient.readContract({
        address: this.nftConfig.contractAddress as `0x${string}`,
        abi: ERC1155_ABI,
        functionName: "balanceOf",
        args: [walletAddress as `0x${string}`, BigInt(this.nftConfig.tokenId)],
      });

      if (BigInt(balance) === 0n) {
        throw new Error(
          `NFT ownership validation failed. Required token ID ${this.nftConfig.tokenId} not owned.`
        );
      }

      if (requestId) {
        log.debug("NFT ownership validated", "distributor", requestId, {
          walletAddress,
          tokenId: this.nftConfig.tokenId,
          balance: balance.toString(),
        });
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("NFT ownership")) {
        throw error; // Re-throw our own error
      }

      // Wrap contract errors
      throw new Error(
        `NFT validation failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private async validateWeeklyLimit(
    walletAddress: string,
    requestId?: string
  ): Promise<void> {
    if (!this.weeklyLimitConfig) return;

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const recentClaims = await queries.getRecentClaims(
      walletAddress,
      this.cfg.distributorId,
      weekAgo
    );

    // First claim this week - allowed
    if (recentClaims.length === 0) {
      if (requestId) {
        log.debug(
          "Weekly limit validation passed - first claim",
          "distributor",
          requestId
        );
      }
      return;
    }

    if (recentClaims.length >= this.weeklyLimitConfig.maxClaimsPerWeek) {
      const oldestClaim = recentClaims[recentClaims.length - 1];
      if (!oldestClaim) return;

      const oldestClaimTime = new Date(oldestClaim.created_at).getTime();
      const slotOpensAt = oldestClaimTime + 7 * 24 * 60 * 60 * 1000;
      const msUntilSlotOpens = slotOpensAt - Date.now();

      if (msUntilSlotOpens > 0) {
        const hoursUntilSlot = Math.ceil(msUntilSlotOpens / (1000 * 60 * 60));
        throw new Error(
          `Weekly limit reached (${recentClaims.length}/${this.weeklyLimitConfig.maxClaimsPerWeek}). ` +
            `Next slot opens in ${hoursUntilSlot}h`
        );
      }
    }

    const lastClaim = recentClaims[0];
    if (!lastClaim) return;

    const lastClaimTime = new Date(lastClaim.created_at).getTime();
    const hoursSinceLastClaim = (Date.now() - lastClaimTime) / (1000 * 60 * 60);

    if (hoursSinceLastClaim < this.weeklyLimitConfig.cooldownHours) {
      const hoursRemaining = Math.ceil(
        this.weeklyLimitConfig.cooldownHours - hoursSinceLastClaim
      );
      throw new Error(
        `Cooldown active: wait ${hoursRemaining}h before next claim`
      );
    }

    if (requestId) {
      log.debug("Weekly limit validation passed", "distributor", requestId, {
        claimsThisWeek: recentClaims.length,
        maxPerWeek: this.weeklyLimitConfig.maxClaimsPerWeek,
        hoursSinceLastClaim: Math.floor(hoursSinceLastClaim),
        cooldownHours: this.weeklyLimitConfig.cooldownHours,
      });
    }
  }
}
