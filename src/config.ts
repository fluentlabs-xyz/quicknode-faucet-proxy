import { Distributor } from "./distributor";
import type { GlobalConfig, IValidator } from "./types";
import { log } from "./logger";
import { validators } from "./validators";

export async function loadDistributors(): Promise<Map<string, Distributor>> {
  const distributors = new Map<string, Distributor>();

  const configFile = await Bun.file("./config.json").text();
  const config: GlobalConfig = JSON.parse(
    configFile.replace(/\$\{([^}]+)\}/g, (_, key) => Bun.env[key] || "")
  );

  for (const [name, distConfig] of Object.entries(config.distributors)) {
    const { validators: validatorConfigs, ...distributorContext } = distConfig;
    const validators = createValidators(validatorConfigs, distributorContext);

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

  log.info("Distributors initialized", "config", undefined, {
    count: distributors.size,
  });

  return distributors;
}

function createValidators(
  validatorConfigs: Record<string, Record<string, unknown>>,
  distributorContext: Record<string, unknown> = {}
): IValidator[] {
  return Object.entries(validatorConfigs)
    .map(([name, config]) => {
      const ValidatorClass = validators[name as keyof typeof validators];
      if (!ValidatorClass) {
        log.warn(`Unknown validator: ${name}`, "config");
        return null;
      }
      return new ValidatorClass({ ...distributorContext, ...config });
    })
    .filter(Boolean) as IValidator[];
}
