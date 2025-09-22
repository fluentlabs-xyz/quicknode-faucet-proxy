// script/claim-direct.ts
import axios from "axios";

const [walletAddress, visitorId, ip] = process.argv.slice(2);

if (!walletAddress || !visitorId) {
  console.error(
    "Usage: bun run script/claim-direct.ts <walletAddress> <visitorId> [ip]"
  );
  console.error("\nExamples:");
  console.error(
    "  bun run script/claim-direct.ts 0x742d35Cc6634C0532925a3b844Bc9e7595f0b0bb visitor_123"
  );
  console.error(
    "  bun run script/claim-direct.ts 0x742d35Cc6634C0532925a3b844Bc9e7595f0b0bb visitor_123 192.168.1.100"
  );
  process.exit(1);
}

// Validate wallet address format
if (!/^0x[a-fA-F0-9]{40}$/i.test(walletAddress)) {
  console.error("Error: Invalid wallet address format");
  console.error("Expected format: 0x followed by 40 hexadecimal characters");
  process.exit(1);
}

const CLAIM_URL = "http://localhost:8080/buzzing/daily";
// const CLAIM_URL = "https://eco-faucet-api.fluent.xyz/buzzing/daily";

// Generate a random IP if not provided (for testing only!)
const clientIp =
  ip ||
  `${Math.floor(Math.random() * 255)}.${Math.floor(
    Math.random() * 255
  )}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

console.log("Claiming with:");
console.log("  Wallet Address:", walletAddress);
console.log("  Visitor ID:", visitorId);
console.log("  IP Address:", clientIp);
console.log("  Endpoint:", CLAIM_URL);

try {
  const resp = await axios.post(
    CLAIM_URL,
    {
      visitorId,
      walletAddress,
    },
    {
      headers: {
        // No Authorization header needed for direct mode
        "Content-Type": "application/json",
        // Simulate different client IPs for testing
        "X-Forwarded-For": clientIp,
        "X-Real-IP": clientIp,
      },
      validateStatus: () => true,
    }
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
  if (err.response) {
    console.error("Response data:", err.response.data);
  }
  process.exit(2);
}
