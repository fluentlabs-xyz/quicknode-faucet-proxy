import axios from "axios";
const PARTNER_API_KEY = Bun.env.PARTNER_API_KEY!;
const API_URL = Bun.env.FAUCET_API_URL;
const distributorId = process.argv[2];

if (!distributorId) {
  console.error("Usage: bun run delete-distributor.ts <distributorId>");
  process.exit(1);
}

async function main() {
  await axios.delete(`${API_URL}/partners/distributors/${distributorId}`, {
    headers: { "x-partner-api-key": PARTNER_API_KEY },
  });
  console.log(`Distributor ${distributorId} deleted.`);
}
main();
