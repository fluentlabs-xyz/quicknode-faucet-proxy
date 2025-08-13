import axios from "axios";
import type { QuickNodeRules, QuickNodeRuleKey } from "../src/types";

const PARTNER_API_KEY = Bun.env.PARTNER_API_KEY!;
const API_URL = Bun.env.FAUCET_API_URL || "https://api.faucet.quicknode.com";
const distributorId = process.argv[2];

if (!distributorId) {
  console.error(
    "Usage: bun run script/set-distributor-rules.ts <distributorId>"
  );
  process.exit(1);
}

// --- Set rules here (for convenience, you can move this to a separate config) ---
const RULES: QuickNodeRules = {
  DRIP_PER_INTERVAL: 10,
  DRIP_INTERVAL: "THIRTY_MINUTES",
  DEFAULT_DRIP_AMOUNT: 0.2,
  // If you want to remove a rule, simply omit it here
};

// --- Get current distributor rules ---
async function getQuickNodeRules(distributorId: string) {
  const resp = await axios.get(
    `${API_URL}/partners/distributors/${distributorId}/rules`,
    {
      headers: { "x-partner-api-key": PARTNER_API_KEY },
    }
  );
  return resp.data;
}

// --- Delete a rule ---
async function deleteRule(distributorId: string, ruleUuid: string) {
  await axios.delete(
    `${API_URL}/partners/distributors/${distributorId}/rules/${ruleUuid}`,
    {
      headers: { "x-partner-api-key": PARTNER_API_KEY },
    }
  );
}

// --- Create or update a rule ---
async function setRule(
  distributorId: string,
  key: QuickNodeRuleKey,
  value: string | number
) {
  await axios.post(
    `${API_URL}/partners/distributors/${distributorId}/rules`,
    { key, value },
    { headers: { "x-partner-api-key": PARTNER_API_KEY } }
  );
}

// --- Main logic ---
async function syncQuickNodeRules(
  distributorId: string,
  rules: QuickNodeRules
) {
  // Fetch all current rules
  const existing = await getQuickNodeRules(distributorId);

  // Convert to a map: key => { uuid, value }
  const existingMap = new Map<string, { uuid: string; value: any }>(
    (existing?.data || []).map((r: any) => [
      r.key,
      { uuid: r.uuid, value: r.value },
    ])
  );

  // --- Delete rules that are not specified in the current config ---
  for (const [key, { uuid }] of existingMap) {
    if (!(key in rules)) {
      console.log(`Deleting rule: ${key} (${uuid})`);
      await deleteRule(distributorId, uuid);
    }
  }

  // --- Create or update specified rules ---
  for (const [key, value] of Object.entries(rules)) {
    const ex = existingMap.get(key);
    if (!ex || ex.value !== value) {
      console.log(`${ex ? "Updating" : "Creating"} rule: ${key} = ${value}`);
      await setRule(distributorId, key as QuickNodeRuleKey, value);
    }
  }

  console.log("Distributor rules synced!");
}

// --- Run ---
syncQuickNodeRules(distributorId, RULES).catch((e) => {
  console.error("Failed to sync rules:", e.message || e);
  process.exit(2);
});
