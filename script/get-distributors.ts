import axios from "axios";

const PARTNER_API_KEY = Bun.env.PARTNER_API_KEY!;
const API_URL = Bun.env.FAUCET_API_URL;

async function main() {
  const resp = await axios.get(`${API_URL}/partners/distributors`, {
    headers: { "x-partner-api-key": PARTNER_API_KEY },
  });
  console.log(JSON.stringify(resp.data, null, 2));
}
main();
