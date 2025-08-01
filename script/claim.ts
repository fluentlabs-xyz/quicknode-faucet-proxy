import axios from "axios";

const [jwt, visitorId] = process.argv.slice(2);

if (!jwt || !visitorId) {
  console.error("Usage: bun run script/claim.ts <jwt> <visitorId>");
  process.exit(1);
}

const CLAIM_URL = "http://localhost:3001/claim";

try {
  const resp = await axios.post(
    CLAIM_URL,
    { visitorId },
    {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
      validateStatus: () => true,
    }
  );

  console.log("Response:", resp.status, resp.data);
} catch (err: any) {
  console.error("Claim request failed:", err.message || err);
  process.exit(2);
}
