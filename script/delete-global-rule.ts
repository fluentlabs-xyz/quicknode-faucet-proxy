import axios from "axios";
const PARTNER_API_KEY = Bun.env.PARTNER_API_KEY!;
const API_URL = Bun.env.FAUCET_API_URL;
const ruleUuid = process.argv[2];

if (!ruleUuid) {
  console.error("Usage: bun run delete-global-rule.ts <ruleUuid>");
  process.exit(1);
}

async function main() {
  await axios.delete(`${API_URL}/partners/global-rules/${ruleUuid}`, {
    headers: { "x-partner-api-key": PARTNER_API_KEY },
  });
  console.log(`Global rule ${ruleUuid} deleted.`);
}
main();
