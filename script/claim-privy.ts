import axios from "axios";

const [jwt, visitorId, endpoint] = process.argv.slice(2);

if (!jwt || !visitorId) {
  console.error(
    "Usage: bun run script/claim-privy.ts <privy-jwt> <visitorId> [endpoint]",
  );
  console.error("\nExamples:");
  console.error("  bun run script/claim-privy.ts $PRIVY_TOKEN visitor_123");
  console.error(
    "  bun run script/claim-privy.ts $PRIVY_TOKEN visitor_123 /connect/claim",
  );
  process.exit(1);
}

const BASE_URL = process.env.API_URL || "http://localhost:8080";
const CLAIM_URL = `${BASE_URL}${endpoint || "/connect/claim"}`;

const clientIp = `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

console.log("Claiming with Privy:");
console.log("  Endpoint:", CLAIM_URL);
console.log("  Visitor ID:", visitorId);
console.log("  IP Address:", clientIp);

try {
  const resp = await axios.post(
    CLAIM_URL,
    { visitorId },
    {
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
        "X-Forwarded-For": clientIp,
      },
      validateStatus: () => true,
    },
  );

  console.log("\nResponse Status:", resp.status);
  console.log("Response Data:", JSON.stringify(resp.data, null, 2));

  if (resp.data.success) {
    console.log("\n✅ Claim successful!");
    console.log("  Transaction ID:", resp.data.transactionId);
    console.log("  Amount:", resp.data.amount, "ETH");
  } else {
    console.log("\n❌ Claim failed:", resp.data.error);
  }
} catch (err: any) {
  console.error("Request failed:", err.message || err);
  process.exit(2);
}
