// src/index.ts - Ultra KISS version
import { logger } from "./logger";
import { ensureDatabase } from "./database";
import { loadDistributors } from "./config";
import { createServer } from "./server";

// Start application
try {
  logger.info("Starting application...");

  // Initialize
  await ensureDatabase();
  const distributors = await loadDistributors();
  const server = createServer(distributors);

  logger.info(`Server running on port ${server.port}`);

  // Shutdown handler
  process.on("SIGTERM", () => {
    logger.info("Shutting down...");
    server.stop();
    process.exit(0);
  });
} catch (error) {
  logger.error("Startup failed", error);
  process.exit(1);
}
