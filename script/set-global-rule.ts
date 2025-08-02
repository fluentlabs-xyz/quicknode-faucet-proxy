import axios from "axios";

const PARTNER_API_KEY = Bun.env.PARTNER_API_KEY!;
const API_URL = Bun.env.FAUCET_API_URL || "https://api.faucet.quicknode.com";

const key = process.argv[2];
const rawValue = process.argv[3];

if (!key || rawValue === undefined) {
  console.error("Usage: bun run set-global-rule.ts <key> <value>");
  console.error("\nAvailable keys:");
  console.error(
    "  TOTAL_DRIP_PER_INTERVAL (number) - Total tokens per interval"
  );
  console.error(
    "  TOTAL_DRIP_INTERVAL (enum) - ONE_DAY, TWELVE_HOURS, ONE_HOUR, THIRTY_MINUTES"
  );
  console.error("  DRIP_PER_INTERVAL (number) - Claims per user per interval");
  console.error(
    "  DRIP_INTERVAL (enum) - ONE_DAY, TWELVE_HOURS, ONE_HOUR, THIRTY_MINUTES"
  );
  console.error("  MAINNET_BALANCE (number) - Minimum ETH balance on mainnet");
  console.error(
    "  MAINNET_TRANSACTION_COUNT (number) - Minimum tx count on mainnet"
  );
  console.error("  DEFAULT_DRIP_AMOUNT (number) - Tokens per claim");
  process.exit(1);
}

// Rules that expect numeric values
const numericRules = [
  "TOTAL_DRIP_PER_INTERVAL",
  "DRIP_PER_INTERVAL",
  "MAINNET_BALANCE",
  "MAINNET_TRANSACTION_COUNT",
  "DEFAULT_DRIP_AMOUNT",
];

// Rules that expect enum values
const enumRules = ["TOTAL_DRIP_INTERVAL", "DRIP_INTERVAL"];
const validIntervals = [
  "ONE_DAY",
  "TWELVE_HOURS",
  "ONE_HOUR",
  "THIRTY_MINUTES",
];

// Parse value based on rule type
let value: string | number = rawValue;

if (numericRules.includes(key)) {
  // Convert to number for numeric rules
  value = Number(rawValue);
  if (isNaN(value)) {
    console.error(`Error: ${key} requires a numeric value, got "${rawValue}"`);
    process.exit(1);
  }
} else if (enumRules.includes(key)) {
  // Validate enum values
  if (!validIntervals.includes(rawValue)) {
    console.error(`Error: ${key} must be one of: ${validIntervals.join(", ")}`);
    process.exit(1);
  }
  value = rawValue;
}

async function main() {
  try {
    const resp = await axios.post(
      `${API_URL}/partners/global-rules`,
      { key, value },
      { headers: { "x-partner-api-key": PARTNER_API_KEY } }
    );
    console.log("Global rule set successfully:");
    console.log(`  Key: ${key}`);
    console.log(`  Value: ${value}`);
    console.log("Response:", resp.data);
  } catch (error: any) {
    console.error("Failed to set global rule:");
    if (error.response) {
      console.error(`  Status: ${error.response.status}`);
      console.error(`  Message: ${JSON.stringify(error.response.data)}`);
    } else {
      console.error(`  Error: ${error.message}`);
    }
    process.exit(1);
  }
}

main();
