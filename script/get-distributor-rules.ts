import axios from "axios";
const PARTNER_API_KEY = Bun.env.PARTNER_API_KEY!;
const API_URL = Bun.env.QUICKNODE_API_URL;
const distributorId = process.argv[2];

if (!distributorId) {
  console.error("Usage: bun run get-distributor-rules.ts <distributorId>");
  process.exit(1);
}

async function main() {
  const resp = await axios.get(
    `${API_URL}/partners/distributors/${distributorId}/rules`,
    { headers: { "x-partner-api-key": PARTNER_API_KEY } }
  );
  console.log(JSON.stringify(resp.data, null, 2));
}
main();
