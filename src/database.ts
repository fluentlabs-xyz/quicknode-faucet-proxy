// src/database.ts - Ultra KISS version
import postgres from "postgres";
import { logger } from "./logger";

// Simple database connection
const sql = postgres(
  Bun.env.DATABASE_URL || "postgresql://localhost/faucet",
  {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  }
);

/**
 * Ensure database is ready
 */
export async function ensureDatabase(): Promise<void> {
  try {
    // Create claims table if not exists
    await sql`
      CREATE TABLE IF NOT EXISTS claims (
        id SERIAL PRIMARY KEY,
        distributor_id VARCHAR(255) NOT NULL,
        embedded_wallet VARCHAR(64) NOT NULL,
        external_wallet VARCHAR(64) NOT NULL,
        visitor_id VARCHAR(64) NOT NULL,
        ip VARCHAR(45),
        tx_id VARCHAR(128),
        amount DECIMAL(10, 4) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Create indexes for common queries
    await sql`CREATE INDEX IF NOT EXISTS idx_claims_wallet ON claims(external_wallet, distributor_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_claims_created ON claims(created_at)`;

    logger.info("Database ready");
  } catch (error) {
    logger.error("Database setup failed", error);
    throw error;
  }
}

/**
 * Database queries - simple and direct
 */
export const queries = {
  // Check if wallet already claimed
  async checkExistingClaim(
    wallet: string,
    distributorId: string
  ): Promise<boolean> {
    const [result] = await sql`
      SELECT 1 FROM claims 
      WHERE external_wallet = ${wallet} 
      AND distributor_id = ${distributorId}
      LIMIT 1
    `;
    return !!result;
  },

  // Check last claim time for rate limiting
  async getLastClaimTime(
    wallet: string,
    distributorId: string
  ): Promise<Date | null> {
    const [result] = await sql`
      SELECT created_at FROM claims 
      WHERE external_wallet = ${wallet}
      AND distributor_id = ${distributorId}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return result?.created_at || null;
  },

  // Insert new claim
  async insertClaim(claim: {
    distributorId: string;
    embeddedWallet: string;
    externalWallet: string;
    visitorId: string;
    ip: string;
    txId: string | null;
    amount: number;
  }): Promise<void> {
    await sql`
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
    `;
  },
};

// Cleanup on shutdown
process.on("SIGTERM", async () => {
  await sql.end();
});
