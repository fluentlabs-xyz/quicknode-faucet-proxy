import axios from "axios";

const [jwt, visitorId, ip] = process.argv.slice(2);

if (!jwt || !visitorId) {
  console.error("Usage: bun run script/claim.ts <jwt> <visitorId> [ip]");
  console.error("\nExamples:");
  console.error("  bun run script/claim.ts $JWT visitor_123");
  console.error("  bun run script/claim.ts $JWT visitor_123 192.168.1.100");
  process.exit(1);
}

const CLAIM_URL = "https://eco-faucet-api.fluent.xyz/claim";

// Generate a random IP if not provided (for testing only!)
const clientIp =
  ip ||
  `${Math.floor(Math.random() * 255)}.${Math.floor(
    Math.random() * 255
  )}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

console.log("Claiming with:");
console.log("  Visitor ID:", visitorId);
console.log("  IP Address:", clientIp);

try {
  const resp = await axios.post(
    CLAIM_URL,
    { visitorId },
    {
      headers: {
        Authorization: `Bearer ${jwt}`,
        // Simulate different client IPs for testing
        "X-Forwarded-For": clientIp,
        "X-Real-IP": clientIp,
      },
      validateStatus: () => true,
    }
  );

  console.log("Response:", resp.status, resp.data);
} catch (err: any) {
  console.error("Claim request failed:", err.message || err);
  process.exit(2);
}
