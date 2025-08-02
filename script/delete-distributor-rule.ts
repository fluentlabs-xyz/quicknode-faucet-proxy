import axios from "axios";
const PARTNER_API_KEY = Bun.env.PARTNER_API_KEY!;
const API_URL = Bun.env.FAUCET_API_URL;
const distributorId = process.argv[2];
const ruleUuid = process.argv[3];

if (!distributorId || !ruleUuid) {
  console.error(
    "Usage: bun run delete-distributor-rule.ts <distributorId> <ruleUuid>"
  );
  process.exit(1);
}

async function main() {
  await axios.delete(
    `${API_URL}/partners/distributors/${distributorId}/rules/${ruleUuid}`,
    { headers: { "x-partner-api-key": PARTNER_API_KEY } }
  );
  console.log(`Rule ${ruleUuid} deleted from distributor ${distributorId}.`);
}
main();
