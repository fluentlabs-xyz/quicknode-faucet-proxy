import { z } from "zod";
import jwt, { type JwtHeader, type SigningKeyCallback } from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import type { IValidator, ValidationResult, ClaimRequest } from "../types";
import { logger } from "../logger";

interface ParaJwtPayload {
  data: {
    userId: string;
    wallets: Array<{
      id: string;
      type: string;
      address: string;
      publicKey: string;
    }>;
    externalWallets: Array<{
      id: string;
      address: string;
      type: string;
      isVerified: boolean;
    }>;
  };
  iat: number;
  sub: string;
  aud: string;
  exp: number;
}

const ParaAccountConfigSchema = z.object({
  paraJwksUrl: z.url(),
  paraVerifyUrl: z.url(),
  paraSecretKey: z.string(),
});

export class ParaAccountValidator implements IValidator {
  readonly name = "para-account";
  readonly configSchema = ParaAccountConfigSchema;

  private readonly paraJwksUrl: string;
  private readonly paraVerifyUrl: string;
  private readonly paraSecretKey: string;
  private readonly jwksClient: jwksClient.JwksClient;

  constructor(config: Record<string, unknown>) {
    const parsed = this.configSchema.parse(config);
    this.paraJwksUrl = parsed.paraJwksUrl;
    this.paraVerifyUrl = parsed.paraVerifyUrl;
    this.paraSecretKey = parsed.paraSecretKey;
    this.jwksClient = jwksClient({ jwksUri: this.paraJwksUrl });
  }

  async validate(request: ClaimRequest): Promise<ValidationResult> {
    try {
      if (!request.token) {
        return { success: false, error: "Authorization token is required" };
      }

      const jwtResult = await this.validateParaJwt(request.token);
      if (!jwtResult.valid) {
        return { success: false, error: `Invalid token: ${jwtResult.error}` };
      }

      const walletData = this.extractWalletAddresses(jwtResult.payload);
      if (!walletData.success) {
        return { success: false, error: walletData.error };
      }

      await this.verifyParaWalletAddress(walletData.embeddedWallet);

      return {
        success: true,
        data: {
          embeddedWallet: walletData.embeddedWallet,
          externalWallet: walletData.externalWallet,
          userId: jwtResult.payload.data.userId,
          walletAddress: walletData.externalWallet,
        },
      };
    } catch (error) {
      logger.error("Para account validation failed", {
        error: error instanceof Error ? error.message : String(error),
        component: "para-account-validator",
      });
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Para account validation failed",
      };
    }
  }

  private async validateParaJwt(
    token: string
  ): Promise<
    { valid: true; payload: ParaJwtPayload } | { valid: false; error: string }
  > {
    return new Promise((resolve) => {
      const getKey = (header: JwtHeader, callback: SigningKeyCallback) => {
        if (!header.kid) {
          return callback(new Error("No 'kid' in JWT header"));
        }
        this.jwksClient.getSigningKey(header.kid, (err, key) => {
          if (err || !key) {
            return callback(err || new Error("No signing key found"));
          }
          callback(null, key.getPublicKey());
        });
      };

      jwt.verify(token, getKey, { algorithms: ["RS256"] }, (err, decoded) => {
        if (err) {
          resolve({ valid: false, error: err.message });
        } else {
          resolve({ valid: true, payload: decoded as ParaJwtPayload });
        }
      });
    });
  }

  private async verifyParaWalletAddress(address: string): Promise<void> {
    const resp = await fetch(this.paraVerifyUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-external-api-key": this.paraSecretKey,
      },
      body: JSON.stringify({ address }),
    });

    if (resp.status === 404) return;
    if (!resp.ok) {
      throw new Error(
        `Para wallet verification failed: ${resp.status} ${resp.statusText}`
      );
    }
  }

  private extractWalletAddresses(
    payload: ParaJwtPayload
  ):
    | { success: true; embeddedWallet: string; externalWallet: string }
    | { success: false; error: string } {
    const { wallets, externalWallets } = payload.data || {};

    if (!wallets || !externalWallets) {
      return { success: false, error: "Wallet data not found in token" };
    }

    const embeddedWallet = wallets.find((w) => w.type === "EVM")?.address;
    const externalWallet = externalWallets.find(
      (w) => w.type === "EVM"
    )?.address;

    if (!embeddedWallet || !externalWallet) {
      return { success: false, error: "EVM wallets not found in token" };
    }

    return { success: true, embeddedWallet, externalWallet };
  }
}
