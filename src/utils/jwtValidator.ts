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

// Cache JWKS clients by URL to avoid redundant connections
const jwksClientCache = new Map<string, jwksClient.JwksClient>();

/**
 * Get or create a JWKS client for the specified URL
 * Each unique JWKS URL gets its own client instance to ensure proper key resolution
 *
 * @param jwksUrl - The JWKS endpoint URL
 * @returns JWKS client instance
 */
function getJwksClient(jwksUrl: string): jwksClient.JwksClient {
  let client = jwksClientCache.get(jwksUrl);

  if (!client) {
    client = jwksClient({
      jwksUri: jwksUrl,
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 600000, // 10 minutes
      rateLimit: true,
      jwksRequestsPerMinute: 10,
      timeout: 5000, // 5 second timeout for JWKS requests
    });
    jwksClientCache.set(jwksUrl, client);

    log.info("JWKS client created", "jwt-validator", undefined, {
      jwksUrl,
      totalClients: jwksClientCache.size,
    });
  }

  return client;
}

/**
 * Validate Para JWT token against the specified JWKS endpoint
 *
 * @param token - JWT token to validate
 * @param jwksUrl - JWKS endpoint URL for key verification
 * @returns Validation result with decoded payload or error message
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
        return callback(new Error("Missing 'kid' field in JWT header"));
      }

      client.getSigningKey(header.kid, (err, key) => {
        if (err || !key) {
          const errorMessage =
            err?.message || `No signing key found for kid: ${header.kid}`;
          log.error(
            "Failed to retrieve signing key from JWKS",
            "jwt-validator",
            undefined,
            errorMessage,
            {
              kid: header.kid,
              jwksUrl,
              stack: err?.stack,
            }
          );
          return callback(err || new Error(errorMessage));
        }
        callback(null, key.getPublicKey());
      });
    };

    jwt.verify(
      token,
      getKey,
      {
        algorithms: ["RS256"],
        clockTolerance: 5, // Allow 5 seconds clock skew
      },
      (err, decoded) => {
        if (err) {
          const errorMessage = err.message || "JWT verification failed";
          log.error(
            "JWT verification failed",
            "jwt-validator",
            undefined,
            errorMessage,
            {
              jwksUrl,
              errorCode: err.name,
              stack: err.stack,
            }
          );
          resolve({ valid: false, error: errorMessage });
        } else {
          const payload = decoded as ParaJwtPayload;
          log.debug("JWT verification successful", "jwt-validator", undefined, {
            jwksUrl,
            userId: payload.data?.userId,
            aud: payload.aud,
          });
          resolve({ valid: true, payload });
        }
      }
    );
  });
}

/**
 * Clear all cached JWKS clients
 * Use this when you need to force refresh all JWKS keys
 */
export function clearJwksCache(): void {
  const previousSize = jwksClientCache.size;
  jwksClientCache.clear();
  log.info("JWKS cache cleared", "jwt-validator", undefined, {
    clientsRemoved: previousSize,
  });
}

/**
 * Get current cache statistics for monitoring
 *
 * @returns Object containing cache size and cached URLs
 */
export function getJwksCacheStats(): {
  size: number;
  urls: string[];
  timestamp: string;
} {
  return {
    size: jwksClientCache.size,
    urls: Array.from(jwksClientCache.keys()),
    timestamp: new Date().toISOString(),
  };
}
