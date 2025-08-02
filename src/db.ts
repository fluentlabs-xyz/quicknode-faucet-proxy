import { DATABASE_URL } from "./config";

// Use a proper postgres client for Bun
// You'll need to install: bun add postgres
import postgres from "postgres";

// Create the SQL client with proper configuration from your config
export const sql = postgres(DATABASE_URL, {
  max: 10, // Connection pool size
  idle_timeout: 20,
  connect_timeout: 10,
  max_lifetime: 60 * 30, // 30 minutes
});

export async function ensureClaimsTable() {
  try {
    // Execute commands separately - PostgreSQL doesn't allow multiple commands in prepared statements
    await sql`
      CREATE TABLE IF NOT EXISTS claims (
        id SERIAL PRIMARY KEY,
        embedded_wallet VARCHAR(64) NOT NULL,
        external_wallet VARCHAR(64) NOT NULL,
        visitor_id VARCHAR(64) NOT NULL,
        ip VARCHAR(64) NOT NULL,
        tx_id VARCHAR(128),
        amount FLOAT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    // Create indexes separately
    await sql`CREATE INDEX IF NOT EXISTS claims_embedded_wallet_created_at_idx ON claims(embedded_wallet, created_at)`;
    await sql`CREATE INDEX IF NOT EXISTS claims_external_wallet_created_at_idx ON claims(external_wallet, created_at)`;
    await sql`CREATE INDEX IF NOT EXISTS claims_visitor_id_created_at_idx ON claims(visitor_id, created_at)`;
    await sql`CREATE INDEX IF NOT EXISTS claims_ip_created_at_idx ON claims(ip, created_at)`;

    console.log("✅ Database tables and indexes ensured");
  } catch (error) {
    console.error("❌ Failed to ensure database tables:", error);
    throw error;
  }
}

// Prepared queries for better performance (Bun optimizes these heavily)
export const queries = {
  checkExistingClaim: async (externalWallet: string) => {
    const result = await sql`
      SELECT 1 FROM claims WHERE external_wallet = ${externalWallet} LIMIT 1
    `;
    return result.length > 0;
  },

  insertClaim: async (claim: {
    embeddedWallet: string;
    externalWallet: string;
    visitorId: string;
    ip: string;
    txId: string | null;
    amount: number;
  }) => {
    const result = await sql`
      INSERT INTO claims (
        embedded_wallet, external_wallet, visitor_id, ip, tx_id, amount
      ) VALUES (
        ${claim.embeddedWallet},
        ${claim.externalWallet},
        ${claim.visitorId},
        ${claim.ip},
        ${claim.txId},
        ${claim.amount}
      )
      RETURNING id, created_at
    `;
    return result[0];
  },

  getClaimHistory: async (externalWallet: string, limit = 10) => {
    return await sql`
      SELECT * FROM claims 
      WHERE external_wallet = ${externalWallet}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  },
};

// Graceful shutdown handler
process.on("SIGINT", async () => {
  console.log("🔄 Gracefully closing database connections...");
  await sql.end();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("🔄 Gracefully closing database connections...");
  await sql.end();
  process.exit(0);
});
