import { Distributor } from "./distributor";
import type { GlobalConfig, IValidator } from "./types";
import { logger } from "./logger";
import { validators } from "./validators";

export async function loadDistributors(): Promise<Map<string, Distributor>> {
  const distributors = new Map<string, Distributor>();

  const configFile = await Bun.file("./config/distributors.json").text();
  const config: GlobalConfig = JSON.parse(
    configFile.replace(/\$\{([^}]+)\}/g, (_, key) => Bun.env[key] || "")
  );

  for (const [name, distConfig] of Object.entries(config.distributors)) {
    const validators = createValidators(distConfig.validators);

    const distributor = new Distributor({
      id: name,
      name,
      path: distConfig.path,
      distributorId: distConfig.distributor_id,
      distributorApiKey: distConfig.distributor_api_key,
      dripAmount: distConfig.drip_amount,
      validators,
    });

    distributors.set(distConfig.path, distributor);
  }

  logger.info("Distributors initialized", {
    component: "config",
    count: distributors.size,
    paths: Array.from(distributors.keys()),
  });

  return distributors;
}

function createValidators(
  validatorConfigs: Record<string, Record<string, unknown>>
): IValidator[] {
  return Object.entries(validatorConfigs)
    .map(([name, config]) => {
      const ValidatorClass = validators[name as keyof typeof validators];
      if (!ValidatorClass) {
        logger.warn(`Unknown validator: ${name}`, { component: "config" });
        return null;
      }
      return new ValidatorClass(config);
    })
    .filter(Boolean) as IValidator[];
}
