import jwt, { type JwtHeader, type SigningKeyCallback } from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { log } from "../logger";

// ========== TYPES ==========

export interface ParaWallet {
  id: string;
  type: string;
  address: string;
  publicKey: string;
}

export interface ParaExternalWallet {
  id: string;
  address: string;
  type: string;
  isVerified: boolean;
}

export interface ParaJwtPayload {
  sub: string;
  aud?: string;
  iat: number;
  exp: number;
  data: {
    userId: string;
    wallets: ParaWallet[];
    externalWallets?: ParaExternalWallet[];
    email?: string;
    authType: string;
    identifier: string;
    oAuthMethod?: "google" | "x" | "discord" | "facebook" | "apple";
  };
}

export interface PrivyJwtPayload {
  sub: string;
  aud: string;
  iss: string;
  iat: number;
  exp: number;
  sid?: string;
  linked_accounts:
    | string
    | Array<{
        type: string;
        address?: string;
        wallet_client_type?: string;
      }>;
}

export type JwtValidationResult<T> =
  | { valid: true; payload: T }
  | { valid: false; error: string };

// ========== JWKS CLIENT CACHE ==========

const jwksClientCache = new Map<string, jwksClient.JwksClient>();

function getJwksClient(jwksUrl: string): jwksClient.JwksClient {
  let client = jwksClientCache.get(jwksUrl);

  if (!client) {
    client = jwksClient({
      jwksUri: jwksUrl,
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 600_000,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
      timeout: 5000,
    });
    jwksClientCache.set(jwksUrl, client);

    log.info("JWKS client created", "jwt-validator", undefined, {
      jwksUrl,
      totalClients: jwksClientCache.size,
    });
  }

  return client;
}

// ========== JWT VALIDATOR ==========

export async function validateJwt<T>(
  token: string,
  jwksUrl: string,
  options?: { audience?: string; issuer?: string },
): Promise<JwtValidationResult<T>> {
  return new Promise((resolve) => {
    const client = getJwksClient(jwksUrl);

    const getKey = (header: JwtHeader, callback: SigningKeyCallback) => {
      if (!header.kid) {
        return callback(new Error("Missing 'kid' field in JWT header"));
      }

      client.getSigningKey(header.kid, (err, key) => {
        if (err || !key) {
          log.error(
            "Failed to retrieve signing key",
            "jwt-validator",
            err,
            undefined,
            {
              kid: header.kid,
              jwksUrl,
            },
          );
          return callback(
            err || new Error(`No signing key for kid: ${header.kid}`),
          );
        }
        callback(null, key.getPublicKey());
      });
    };

    jwt.verify(
      token,
      getKey,
      {
        algorithms: ["RS256", "ES256"],
        clockTolerance: 5,
        audience: options?.audience,
        issuer: options?.issuer,
      },
      (err, decoded) => {
        if (err) {
          log.error(
            "JWT verification failed",
            "jwt-validator",
            err,
            undefined,
            {
              jwksUrl,
              errorCode: err.name,
            },
          );
          return resolve({ valid: false, error: err.message });
        }

        log.debug("JWT verified", "jwt-validator", undefined, { jwksUrl });
        resolve({ valid: true, payload: decoded as T });
      },
    );
  });
}

// ========== WALLET EXTRACTION ==========

/**
 * Get embedded wallet from Privy token
 * Equivalent to frontend: wallets.find(w => w.connectorType === "embedded")
 */
export function getPrivyEmbeddedWallet(payload: PrivyJwtPayload): string {
  const accounts =
    typeof payload.linked_accounts === "string"
      ? JSON.parse(payload.linked_accounts)
      : payload.linked_accounts || [];

  const embedded = accounts.find(
    (a: { type: string; wallet_client_type?: string }) =>
      a.type === "wallet" && a.wallet_client_type === "privy",
  );

  if (!embedded?.address) {
    throw new Error("No embedded wallet in Privy token");
  }

  return embedded.address;
}

/**
 * Get wallets from Para token
 */
export function getParaWallets(payload: ParaJwtPayload): {
  embeddedWallet: string;
  externalWallet: string;
} {
  const embeddedWallet = payload.data?.wallets?.[0]?.address;
  const externalWallet = payload.data?.externalWallets?.[0]?.address;

  if (!embeddedWallet) throw new Error("No embedded wallet in Para token");
  if (!externalWallet) throw new Error("No external wallet in Para token");

  return { embeddedWallet, externalWallet };
}

// ========== CACHE UTILITIES ==========

export function clearJwksCache(): void {
  const size = jwksClientCache.size;
  jwksClientCache.clear();
  log.info("JWKS cache cleared", "jwt-validator", undefined, {
    clientsRemoved: size,
  });
}

export function getJwksCacheStats() {
  return {
    size: jwksClientCache.size,
    urls: Array.from(jwksClientCache.keys()),
    timestamp: new Date().toISOString(),
  };
}
