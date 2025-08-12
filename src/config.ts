import { Distributor } from "./distributor";
import type { GlobalConfig } from "./types";
import { log } from "./logger";

export async function loadDistributors(): Promise<Map<string, Distributor>> {
  const distributors = new Map<string, Distributor>();

  const configFile = await Bun.file("./config.json").text();
  const config: GlobalConfig = JSON.parse(
    configFile.replace(/\$\{([^}]+)\}/g, (_, key) => Bun.env[key] || "")
  );

  // Now path is the key in config.distributors
  for (const [path, distConfig] of Object.entries(config.distributors)) {
    const distributor = new Distributor({
      path, // path from the key
      name: distConfig.name, // name from the config
      distributorId: distConfig.distributorId,
      distributorApiKey: distConfig.distributorApiKey,
      dripAmount: distConfig.dripAmount,
      validatorConfigs: distConfig.validators,
    });

    // Use path as the key in the Map for routing
    distributors.set(path, distributor);
  }

  log.info("Distributors initialized", "config", undefined, {
    count: distributors.size,
    paths: Array.from(distributors.keys()),
  });

  return distributors;
}
