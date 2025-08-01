import jwt from "jsonwebtoken";
import type { JwtHeader, SigningKeyCallback } from "jsonwebtoken";
import jwksClient from "jwks-rsa";

export interface ParaJwtWallet {
  id: string;
  type: string;
  address: string;
  publicKey: string;
}

export interface ParaJwtExternalWallet {
  createdAt: string;
  updatedAt: string;
  id: string;
  userId: string;
  address: string;
  type: string;
  isVerified: boolean;
}

export interface ParaJwtData {
  userId: string;
  wallets: ParaJwtWallet[];
  externalWallets: ParaJwtExternalWallet[];
  externalWalletAddress: string;
  authType: string;
  identifier: string;
}

export interface ParaJwtPayload {
  data: ParaJwtData;
  iat: number;
  sub: string;
  aud: string;
  exp: number;
}

// Get JWKS URL from environment variables
const JWKS_URI = process.env.PARA_JWKS_URL;
if (!JWKS_URI) throw new Error("Missing PARA_JWKS_URL environment variable");

// Create a JWKS client instance
const client = jwksClient({ jwksUri: JWKS_URI });

/**
 * Resolves the public signing key for a JWT, using the "kid" from its header.
 */
function getKey(header: JwtHeader, callback: SigningKeyCallback) {
  if (!header.kid) {
    return callback(new Error("No 'kid' in JWT header"), undefined);
  }
  client.getSigningKey(header.kid, (err, key) => {
    if (err || !key)
      return callback(err || new Error("No signing key found"), undefined);
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

/**
 * Validates and decodes a Para-issued JWT token.
 * @param token The JWT string to validate.
 * @returns {Promise<{ valid: true, payload: any } | { valid: false, error: string }>}
 */
export async function validateParaJwt(
  token: string
): Promise<{ valid: true; payload: any } | { valid: false; error: string }> {
  return new Promise((resolve) => {
    jwt.verify(
      token,
      getKey,
      {
        algorithms: ["RS256"],
        // No "audience" check for now
      },
      (err, decoded) => {
        if (err) {
          resolve({ valid: false, error: err.message });
        } else {
          resolve({ valid: true, payload: decoded as ParaJwtPayload });
        }
      }
    );
  });
}

// --- Usage Example (SERVER SIDE) ---
//
// const result = await validateParaJwt(tokenFromClient);
// if (result.valid) {
//   // Use result.payload (contains user info, wallets, etc.)
// } else {
//   // Log or handle result.error
// }

// --- CLIENT SIDE: How to obtain the JWT token from Para ---
//
// import { ParaWeb, Environment } from "@getpara/web-sdk";
//
// // 1. Initialize the Para client (PUBLIC_API_KEY: your Para public API key)
// const para = new ParaWeb(Environment.BETA, PUBLIC_API_KEY);
//
// // 2. After user is authenticated, issue the JWT:
// const { token, keyId } = await para.issueJwt();
//
// // 3. Send "token" to your backend for validation.
//
