import jwt from "jsonwebtoken";
import type { JwtHeader, SigningKeyCallback } from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { config } from "../config";

export interface ParaJwtPayload {
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

const client = jwksClient({ jwksUri: config.paraJwksUrl });

function getKey(header: JwtHeader, callback: SigningKeyCallback) {
  if (!header.kid) {
    return callback(new Error("No 'kid' in JWT header"));
  }
  client.getSigningKey(header.kid, (err, key) => {
    if (err || !key) {
      return callback(err || new Error("No signing key found"));
    }
    callback(null, key.getPublicKey());
  });
}

export async function validateParaJwt(
  token: string
): Promise<
  { valid: true; payload: ParaJwtPayload } | { valid: false; error: string }
> {
  return new Promise((resolve) => {
    jwt.verify(token, getKey, { algorithms: ["RS256"] }, (err, decoded) => {
      if (err) {
        resolve({ valid: false, error: err.message });
      } else {
        resolve({ valid: true, payload: decoded as ParaJwtPayload });
      }
    });
  });
}
