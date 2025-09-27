import postgres from "postgres";
import { log } from "./logger";

if (!Bun.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Simple database connection
const sql = postgres(Bun.env.DATABASE_URL!, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

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

    // Add ERC20 column - safe to run multiple times
    await sql`
      ALTER TABLE claims 
      ADD COLUMN IF NOT EXISTS erc20_tx_id VARCHAR(128)
    `.catch(() => {
      // Column already exists in old Postgres - that's fine
    });

    // Create indexes
    await sql`
      CREATE INDEX IF NOT EXISTS idx_claims_created 
      ON claims(created_at)
    `;

    // Composite index for all wallet-based queries (covers both simple and weekly-limit queries)
    await sql`
      CREATE INDEX IF NOT EXISTS idx_claims_external_wallet_distributor_created_lower 
      ON claims(LOWER(external_wallet), distributor_id, created_at DESC)
    `;

    log.info("Database ready", "database");
  } catch (error) {
    log.error("Database setup failed", "database", error);
    throw error;
  }
}

/**
 * Database queries - simple and direct
 * All queries use LOWER() for backward compatibility with existing mixed-case data
 */
export const queries = {
  // Check if wallet already claimed (for once-only validator)
  // Uses LOWER() to handle both old mixed-case and new lowercase addresses
  async checkExistingClaim(
    externalWallet: string,
    distributorId: string
  ): Promise<boolean> {
    const [result] = await sql`
      SELECT 1 FROM claims 
      WHERE LOWER(external_wallet) = LOWER(${externalWallet}) 
      AND distributor_id = ${distributorId}
      LIMIT 1
    `;
    return !!result;
  },

  // Check last claim time for rate limiting
  // Uses LOWER() for case-insensitive comparison
  async getLastClaimTime(
    externalWallet: string,
    distributorId: string
  ): Promise<Date | null> {
    const [result] = await sql`
      SELECT created_at FROM claims 
      WHERE LOWER(external_wallet) = LOWER(${externalWallet})
      AND distributor_id = ${distributorId}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return result?.created_at || null;
  },

  // Get recent claims for weekly limit check
  // Uses LOWER() for case-insensitive comparison
  async getRecentClaims(
    externalWallet: string,
    distributorId: string,
    since: Date
  ) {
    return await sql`
      SELECT created_at FROM claims 
      WHERE LOWER(external_wallet) = LOWER(${externalWallet})
      AND distributor_id = ${distributorId}
      AND created_at >= ${since}
      ORDER BY created_at DESC
    `;
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
    erc20TxId?: string | null;
  }): Promise<void> {
    await sql`
      INSERT INTO claims (
        distributor_id,
        embedded_wallet,
        external_wallet,
        visitor_id,
        ip,
        tx_id,
        amount,
        erc20_tx_id
      ) VALUES (
        ${claim.distributorId},
        ${claim.embeddedWallet.toLowerCase()},
        ${claim.externalWallet.toLowerCase()},
        ${claim.visitorId},
        ${claim.ip},
        ${claim.txId},
        ${claim.amount},
        ${claim.erc20TxId || null}
      )
    `;
  },
};

// Cleanup on shutdown
process.on("SIGTERM", async () => {
  await sql.end();
});
