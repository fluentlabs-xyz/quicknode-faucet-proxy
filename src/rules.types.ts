export type DistributorRuleKey =
  | "TOTAL_DRIP_PER_INTERVAL"
  | "TOTAL_DRIP_INTERVAL"
  | "DRIP_PER_INTERVAL"
  | "DRIP_INTERVAL" // ONE_DAY, TWELVE_HOURS, ONE_HOUR, THIRTY_MINUTES
  | "MAINNET_BALANCE"
  | "MAINNET_TRANSACTION_COUNT"
  | "DEFAULT_DRIP_AMOUNT";

export type DistributorRuleValue = string | number;

export type DistributorRules = Partial<
  Record<DistributorRuleKey, DistributorRuleValue>
>;
