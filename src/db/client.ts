import postgres from "postgres";
import { config } from "../config";

export const sql = postgres(config.databaseUrl, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  max_lifetime: 60 * 30, // 30 minutes
});

// Graceful shutdown
const shutdown = async () => {
  console.log("🔄 Closing database connections...");
  await sql.end();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
