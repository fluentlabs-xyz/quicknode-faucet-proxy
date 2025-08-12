import { log } from "./logger";
import { ensureDatabase } from "./database";
import { loadDistributors } from "./config";
import { createServer } from "./server";

// Start application
try {
  log.info("Starting application...", "startup");

  // Initialize
  await ensureDatabase();
  const distributors = await loadDistributors();
  const server = createServer(distributors);

  log.info(`Server running on port ${server.port}`, "startup");

  // Shutdown handler
  process.on("SIGTERM", () => {
    log.info("Shutting down...", "shutdown");
    server.stop();
    process.exit(0);
  });
} catch (error) {
  log.error("Startup failed", "startup", error);
  process.exit(1);
}
