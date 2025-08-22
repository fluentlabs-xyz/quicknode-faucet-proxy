import jwt, { type JwtHeader, type SigningKeyCallback } from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { log } from "../logger";

export interface ParaJwtPayload {
  data: {
    userId: string;
    wallets: Array<{
      id: string;
      type: string;
      address: string;
      publicKey: string;
    }>;
    email?: string;
    authType: string;
    identifier: string;
    oAuthMethod?: "google" | "x" | "discord" | "facebook" | "apple";
    // External wallets are optional - only present when user connects external wallet
    externalWallets?: Array<{
      id: string;
      address: string;
      type: string;
      isVerified: boolean;
    }>;
    externalWalletAddress?: string;
  };
  iat: number;
  exp: number;
  sub: string;
  aud?: string;
}
// Global jwksClient for shared use
let globalJwksClient: jwksClient.JwksClient | null = null;

/**
 * Initialize global JWKS client
 */
function getJwksClient(jwksUrl: string): jwksClient.JwksClient {
  if (!globalJwksClient) {
    globalJwksClient = jwksClient({ jwksUri: jwksUrl });
  }
  return globalJwksClient;
}

/**
 * Validate Para JWT token
 * Shared utility for consistent JWT validation
 */
export async function validateParaJwt(
  token: string,
  jwksUrl: string
): Promise<
  { valid: true; payload: ParaJwtPayload } | { valid: false; error: string }
> {
  return new Promise((resolve) => {
    const client = getJwksClient(jwksUrl);

    const getKey = (header: JwtHeader, callback: SigningKeyCallback) => {
      if (!header.kid) {
        return callback(new Error("No 'kid' in JWT header"));
      }

      client.getSigningKey(header.kid, (err, key) => {
        if (err || !key) {
          log.error("JWKS key retrieval failed", "jwt-validator", err);
          return callback(err || new Error("No signing key found"));
        }
        callback(null, key.getPublicKey());
      });
    };

    jwt.verify(token, getKey, { algorithms: ["RS256"] }, (err, decoded) => {
      if (err) {
        log.error("JWT verification failed", "jwt-validator", err);
        resolve({ valid: false, error: err.message });
      } else {
        resolve({ valid: true, payload: decoded as ParaJwtPayload });
      }
    });
  });
}
