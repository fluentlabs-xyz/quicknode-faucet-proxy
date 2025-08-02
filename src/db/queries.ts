import { sql } from "./client";
import type { ClaimRecord } from "../types";

export async function ensureClaimsTable() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS claims (
        id SERIAL PRIMARY KEY,
        distributor_id UUID NOT NULL,
        embedded_wallet VARCHAR(64) NOT NULL,
        external_wallet VARCHAR(64) NOT NULL,
        visitor_id VARCHAR(64) NOT NULL,
        ip VARCHAR(64) NOT NULL,
        tx_id VARCHAR(128),
        amount DECIMAL(18, 8) DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    // Only essential indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_claims_external_wallet ON claims(external_wallet)`;

    console.log("✅ Database ready");
  } catch (error) {
    console.error("❌ Database setup failed:", error);
    throw error;
  }
}

export const queries = {
  async checkExistingClaim(externalWallet: string): Promise<boolean> {
    console.log("Checking existing claim for wallet:", externalWallet);
    const [result] = await sql`
      SELECT 1 FROM claims 
      WHERE external_wallet = ${externalWallet} 
      LIMIT 1
    `;
    return !!result;
  },

  async insertClaim(
    claim: Omit<ClaimRecord, "id" | "createdAt">
  ): Promise<ClaimRecord> {
    console.log("Inserting claim:", claim);
    const [result] = await sql`
      INSERT INTO claims (
        distributor_id,
        embedded_wallet, 
        external_wallet, 
        visitor_id, 
        ip, 
        tx_id, 
        amount
      ) VALUES (
        ${claim.distributorId},
        ${claim.embeddedWallet},
        ${claim.externalWallet},
        ${claim.visitorId},
        ${claim.ip},
        ${claim.txId},
        ${claim.amount}
      )
      RETURNING *
    `;
    return result as ClaimRecord;
  },

  async getClaimStats() {
    const [stats] = await sql`
      SELECT 
        COUNT(*)::int as total_claims,
        COUNT(DISTINCT external_wallet)::int as unique_wallets,
        COALESCE(SUM(amount), 0)::float as total_amount,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END)::int as claims_24h
      FROM claims
    `;
    return stats;
  },
};
