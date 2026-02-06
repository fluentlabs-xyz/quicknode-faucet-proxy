import { validateJwt, type PrivyJwtPayload } from "../src/utils/jwtValidator";

const [token, appId] = process.argv.slice(2);

if (!token) {
  console.error("Usage: bun run script/parse-privy-jwt.ts <token> [appId]");
  console.error("\nExamples:");
  console.error("  bun run script/parse-privy-jwt.ts $TOKEN");
  console.error(
    "  bun run script/parse-privy-jwt.ts $TOKEN cmirarsjw00cxl20dgze5knzv",
  );
  process.exit(1);
}

function decodeJwt(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");

  const payload = parts[1];
  if (!payload) throw new Error("Invalid JWT: missing payload");

  return JSON.parse(Buffer.from(payload, "base64url").toString()) as Record<
    string,
    unknown
  >;
}

console.log("=== Decoding Privy Identity Token ===\n");

const decoded = decodeJwt(token);
console.log("Full decoded payload:", JSON.stringify(decoded, null, 2));
console.log("Key fields:");
console.log("  sub (user ID):", decoded.sub);
console.log("  aud (app ID):", decoded.aud);
console.log("  iss:", decoded.iss);

const exp = decoded.exp as number;
console.log("  exp:", new Date(exp * 1000).toISOString());
console.log("  expired:", exp * 1000 < Date.now() ? "⚠️ YES" : "✅ NO");

// linked_accounts is STRINGIFIED JSON in identity tokens
const linkedAccountsRaw = decoded.linked_accounts as string | undefined;
const linkedAccounts = linkedAccountsRaw ? JSON.parse(linkedAccountsRaw) : [];

console.log("\n--- Linked Accounts ---");
for (const acc of linkedAccounts) {
  if (acc.type === "wallet") {
    const isEmbedded = acc.wallet_client_type === "privy";
    console.log(
      `  ${isEmbedded ? "🔐 embedded" : "🦊 external"}: ${acc.address} (${acc.wallet_client_type})`,
    );
  } else {
    console.log(
      `  📧 ${acc.type}: ${acc.username || acc.address || acc.subject || "N/A"}`,
    );
  }
}

// Extract wallets
const wallets = linkedAccounts.filter(
  (a: { type: string }) => a.type === "wallet",
);
const embedded = wallets.find(
  (w: { wallet_client_type: string }) => w.wallet_client_type === "privy",
);
const external = wallets.find(
  (w: { wallet_client_type: string }) => w.wallet_client_type !== "privy",
);

console.log("\n--- Faucet Wallets ---");
console.log("  Target (embedded):", embedded?.address || "❌ NOT FOUND");
console.log("  User (external):", external?.address || "❌ NOT FOUND");

if (!embedded || !external) {
  console.log("\n⚠️  Missing wallets for faucet claim!");
  if (!external) {
    console.log("   User needs to connect an external wallet (MetaMask, etc.)");
  }
}

// Verify signature
const resolvedAppId = appId || (decoded.aud as string);

if (resolvedAppId) {
  console.log("\n=== Verifying JWT Signature ===\n");

  const jwksUrl = `https://auth.privy.io/api/v1/apps/${resolvedAppId}/jwks.json`;
  console.log("JWKS URL:", jwksUrl);

  const result = await validateJwt<PrivyJwtPayload>(token, jwksUrl, {
    audience: resolvedAppId,
    issuer: "privy.io",
  });

  if (!result.valid) {
    console.error("\n❌ Verification failed:", result.error);
    process.exit(2);
  }

  console.log("✅ JWT signature valid!");
}
