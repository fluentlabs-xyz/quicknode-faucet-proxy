import { log } from "./logger";
import { ensureDatabase } from "./db";
import { createDistributors } from "./distributor";
import { createServer } from "./server";

// Start application
try {
  log.info("Starting application...", "startup");

  // Initialize
  await ensureDatabase();

  if (!Bun.env.CONFIG_PATH) {
    throw new Error("CONFIG_PATH is required");
  }
  const distributors = await createDistributors(Bun.env.CONFIG_PATH!);
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
