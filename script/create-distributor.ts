import axios from "axios";

const PARTNER_API_KEY = Bun.env.PARTNER_API_KEY!;
const API_URL = Bun.env.FAUCET_API_URL;

const name = process.argv[2];
const rps = process.argv[3] ? Number(process.argv[3]) : undefined;

if (!name) {
  console.error("Usage: bun run script/create-distributor.ts <name> [rps]");
  process.exit(1);
}

async function createDistributor(name: string, rps?: number) {
  const body: Record<string, any> = { name };
  if (rps !== undefined) body.rps = rps;

  const resp = await axios.post(`${API_URL}/partners/distributors`, body, {
    headers: { "x-partner-api-key": PARTNER_API_KEY },
  });
  return resp.data;
}

createDistributor(name, rps)
  .then((result) => {
    console.log("Distributor created:");
    console.log(JSON.stringify(result, null, 2));
    if (result.apiKey) {
      console.log(`Distributor API Key: ${result.apiKey}`);
    }
    if (result.uuid) {
      console.log(`Distributor UUID: ${result.uuid}`);
    }
  })
  .catch((e) => {
    console.error(
      "Failed to create distributor:",
      e.response?.data || e.message || e
    );
    process.exit(2);
  });
