import z from "zod";
import { queries } from "./db";
import { log } from "./logger";
import { quickNodeService } from "./quicknode";
import type {
  ClaimRequest,
  ClaimResult,
  DistributorConfig,
  GlobalConfig,
} from "./types";
import { validateParaJwt } from "./utils/jwtValidator";
import { NFTOwnershipValidator } from "./validators/nft";
import { OnceOnlyValidator, TimeLimitValidator } from "./validators/time";
import { ERC20TokenService } from "./erc20";

export async function createDistributors(
  configPath: string
): Promise<Map<string, Distributor>> {
  const distributors = new Map<string, Distributor>();

  const configFile = await Bun.file(configPath).text();
  const config: GlobalConfig = JSON.parse(
    configFile.replace(/\$\{([^}]+)\}/g, (_, key) => Bun.env[key] || "")
  );

  for (const [path, distConfig] of Object.entries(config.distributors)) {
    const distributor = new Distributor({
      path,
      distributorId: distConfig.distributorId,
      distributorApiKey: distConfig.distributorApiKey,
      dripAmount: distConfig.dripAmount,
      validators: distConfig.validators,
      erc20Config: distConfig.erc20Config,
    });

    distributors.set(path, distributor);
  }

  log.info("Distributors initialized", "config", undefined, {
    count: distributors.size,
    paths: Array.from(distributors.keys()),
  });

  return distributors;
}

const ParaConfigSchema = z.object({
  paraJwksUrl: z.url("Para JWKS URL must be a valid URL"),
  paraVerifyUrl: z.url("Para Verify URL must be a valid URL"),
  paraSecretKey: z.string().min(1, "Para Secret Key is required"),
});

export class Distributor {
  private paraConfig?: {
    paraJwksUrl: string;
    paraVerifyUrl: string;
    paraSecretKey: string;
  };
  private isDirect = false;

  // Validators
  private timeLimitValidator?: TimeLimitValidator;
  private onceOnlyValidator?: OnceOnlyValidator;
  private nftValidator?: NFTOwnershipValidator;

  // ERC20 service
  private erc20Service?: ERC20TokenService;

  constructor(private readonly cfg: DistributorConfig) {
    this.parseValidatorConfigs();

    // Initialize ERC20 service if configured
    if (cfg.erc20Config) {
      this.erc20Service = new ERC20TokenService(cfg.erc20Config);
    }

    log.info("Distributor initialized", "distributor", undefined, {
      path: cfg.path,
      mode: this.isDirect ? "direct" : "para",
      onceOnlyEnabled: !!this.onceOnlyValidator,
      timeLimitEnabled: !!this.timeLimitValidator,
      nftEnabled: !!this.nftValidator,
      erc20Enabled: !!this.erc20Service,
    });
  }

  get path() {
    return this.cfg.path;
  }

  get id() {
    return this.cfg.distributorId;
  }

  private parseValidatorConfigs(): void {
    if (!this.cfg.validators) {
      throw new Error(`No validator configs for ${this.cfg.path}`);
    }

    const configs = this.cfg.validators;

    // Exactly one wallet source must be configured
    if (configs["para-account"] && configs["direct"]) {
      throw new Error(
        `Conflicting configs: "para-account" and "direct" cannot both be enabled`
      );
    }
    if (!configs["para-account"] && !configs["direct"]) {
      throw new Error(`One of "para-account" or "direct" must be configured`);
    }

    // Parse wallet source
    if (configs["para-account"]) {
      this.paraConfig = ParaConfigSchema.parse(configs["para-account"]);
    }

    if (configs["direct"]) {
      this.isDirect = true;
    }

    // Create validators
    if (configs["once-only"]) {
      this.onceOnlyValidator = new OnceOnlyValidator();
    }

    // Support both old "weekly-limit" and new "time-limit" configs
    if (configs["weekly-limit"]) {
      const oldConfig = configs["weekly-limit"] as any;
      this.timeLimitValidator = new TimeLimitValidator({
        period: "week",
        maxClaims: oldConfig.maxClaimsPerWeek || 3,
        cooldownHours: oldConfig.cooldownHours || 24,
      });
    } else if (configs["time-limit"]) {
      this.timeLimitValidator = new TimeLimitValidator(configs["time-limit"]);
    }

    if (configs["nft-ownership"]) {
      this.nftValidator = new NFTOwnershipValidator(configs["nft-ownership"]);
    }
  }

  async parseRequestFromBody(
    body: unknown,
    headers: Headers
  ): Promise<ClaimRequest> {
    if (this.isDirect) {
      return this.parseDirectRequestFromBody(body, headers);
    }
    return this.parseParaRequestFromBody(body, headers);
  }

  private parseParaRequestFromBody(
    body: unknown,
    headers: Headers
  ): Promise<ClaimRequest> {
    const rawBody = body as Record<string, unknown>;

    if (!rawBody?.visitorId) {
      throw new Error("Missing visitorId");
    }

    const authHeader = headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : undefined;

    if (!token) {
      throw new Error("Authorization token is required");
    }

    return Promise.resolve({
      visitorId: rawBody.visitorId as string,
      clientIp: this.extractClientIP(headers),
      token,
      ...rawBody,
    });
  }

  private parseDirectRequestFromBody(
    body: unknown,
    headers: Headers
  ): Promise<ClaimRequest> {
    const rawBody = body as Record<string, unknown>;

    if (!rawBody?.visitorId) {
      throw new Error("Missing visitorId");
    }

    const walletAddress = rawBody.walletAddress as string;
    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/i.test(walletAddress)) {
      throw new Error("Invalid or missing wallet address");
    }

    return Promise.resolve({
      visitorId: rawBody.visitorId as string,
      clientIp: this.extractClientIP(headers),
      walletAddress: walletAddress as `0x${string}`,
      ...rawBody,
    });
  }

  private extractClientIP(headers: Headers): string {
    return (
      headers.get("cf-connecting-ip") ||
      headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headers.get("x-real-ip") ||
      ""
    );
  }

  async processClaim(
    request: ClaimRequest,
    requestId?: string
  ): Promise<ClaimResult> {
    if (this.isDirect) {
      return this.processDirectClaim(request, requestId);
    }
    return this.processParaClaim(request, requestId);
  }

  private async processParaClaim(
    request: ClaimRequest,
    requestId?: string
  ): Promise<ClaimResult> {
    try {
      // Extract wallet addresses from JWT
      const { embeddedWallet, externalWallet } = await this.validateParaAccount(
        request.token as string,
        requestId
      );

      // Run validators
      if (this.onceOnlyValidator) {
        await this.onceOnlyValidator.validate(
          externalWallet,
          this.cfg.distributorId,
          requestId
        );
      }

      if (this.timeLimitValidator) {
        await this.timeLimitValidator.validate(
          externalWallet,
          this.cfg.distributorId,
          requestId
        );
      }

      if (this.nftValidator) {
        await this.nftValidator.validate(externalWallet, requestId);
      }

      // Submit claim to QuickNode
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

      // Transfer ERC20 tokens if configured
      let erc20TxHash: string | undefined;
      if (this.erc20Service) {
        const erc20Result = await this.erc20Service.transferTokens(
          embeddedWallet,
          requestId
        );

        if (!erc20Result.success) {
          // Log error but don't fail the entire claim
          log.error(
            "ERC20 transfer failed after successful QuickNode claim",
            "distributor",
            requestId,
            erc20Result.error,
            {
              wallet: embeddedWallet,
            }
          );
        } else {
          erc20TxHash = erc20Result.txHash;
        }
      }

      // Record successful claim in database
      await queries.insertClaim({
        distributorId: this.cfg.distributorId,
        embeddedWallet,
        externalWallet,
        visitorId: request.visitorId,
        ip: request.clientIp,
        txId: response.transactionId || null,
        amount: this.cfg.dripAmount,
        erc20TxId: erc20TxHash || null,
      });

      return {
        success: true,
        transactionId: response.transactionId || "",
        amount: this.cfg.dripAmount,
        message: "Claim processed successfully",
        erc20TxID: erc20TxHash,
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

  private async processDirectClaim(
    request: ClaimRequest,
    requestId?: string
  ): Promise<ClaimResult> {
    try {
      // Extract wallet address from request
      const walletAddress = request.walletAddress;
      if (!walletAddress) {
        throw new Error("Wallet address is required in direct mode");
      }

      // Run validators
      if (this.onceOnlyValidator) {
        await this.onceOnlyValidator.validate(
          walletAddress,
          this.cfg.distributorId,
          requestId
        );
      }

      if (this.timeLimitValidator) {
        await this.timeLimitValidator.validate(
          walletAddress,
          this.cfg.distributorId,
          requestId
        );
      }

      if (this.nftValidator) {
        await this.nftValidator.validate(walletAddress, requestId);
      }

      // Submit claim to QuickNode
      const response = await quickNodeService.submitClaim(
        this.cfg.distributorApiKey,
        {
          address: walletAddress,
          ip: request.clientIp,
          visitorId: request.visitorId,
        },
        requestId
      );

      if (!response.success) {
        throw new Error(response.message || "Claim rejected by QuickNode");
      }

      // Transfer ERC20 tokens if configured
      let erc20TxHash: string | undefined;
      if (this.erc20Service) {
        const erc20Result = await this.erc20Service.transferTokens(
          walletAddress,
          requestId
        );

        if (!erc20Result.success) {
          // Log error but don't fail the entire claim
          log.error(
            "ERC20 transfer failed after successful QuickNode claim",
            "distributor",
            requestId,
            erc20Result.error,
            {
              wallet: walletAddress,
            }
          );
        } else {
          erc20TxHash = erc20Result.txHash;
        }
      }

      // Record successful claim in database
      await queries.insertClaim({
        distributorId: this.cfg.distributorId,
        embeddedWallet: walletAddress,
        externalWallet: walletAddress,
        visitorId: request.visitorId,
        ip: request.clientIp,
        txId: response.transactionId || null,
        amount: this.cfg.dripAmount,
        erc20TxId: erc20TxHash || null,
      });

      return {
        success: true,
        transactionId: response.transactionId || "",
        amount: this.cfg.dripAmount,
        message: "Claim processed successfully",
        erc20TxID: erc20TxHash,
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
   */
  private async validateParaAccount(
    token: string | undefined,
    requestId?: string
  ): Promise<{ embeddedWallet: string; externalWallet: string }> {
    if (!token) {
      throw new Error("Authorization token is required");
    }

    if (!this.paraConfig) {
      throw new Error("Para validation not configured");
    }

    const jwtResult = await validateParaJwt(token, this.paraConfig.paraJwksUrl);

    if (!jwtResult.valid) {
      throw new Error(`Invalid token: ${jwtResult.error}`);
    }

    const payload = jwtResult.payload;
    const data = payload.data;

    const embeddedWallet = data.wallets?.[0]?.address;
    const externalWallet = data.externalWallets?.[0]?.address;

    if (!embeddedWallet) {
      throw new Error("No embedded wallet addresses found in Para token");
    }

    if (!externalWallet) {
      throw new Error("No external wallet addresses found in Para token");
    }

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
}
