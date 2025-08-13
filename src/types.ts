export interface GlobalConfig {
  partner_api_key: string;
  quicknode_api_url: string;
  distributors: {
    [path: string]: {
      // path is the key
      kind?: string;
      distributorId: string;
      distributorApiKey: string;
      name: string; // name is a field
      dripAmount: number;
      dripInterval?: string;
      dripPerInterval?: number;
      validators?: {
        [validatorName: string]: Record<string, unknown>;
      };
    };
  };
}
/**
 * Claim request with flexible properties for validators
 */
export interface ClaimRequest {
  // IP address of the client making the request
  clientIp: string;
  // Fingerprint of the visitor (https://github.com/fingerprintjs/fingerprintjs)
  visitorId: string;
  // Optional para jwt token used for para wallet verification
  token?: string;
  [key: string]: unknown;
}

/**
 * Claim processing result - discriminated union for type safety
 */
export type ClaimResult =
  | {
      success: true;
      transactionId: string;
      amount: number;
      message?: string;
    }
  | {
      success: false;
      error: string;
    };

/**
 * Health check status
 */
export interface HealthStatus {
  status: "ok" | "error";
  timestamp: string;
  details?: Record<string, unknown>;
}

/**
 * Validator result
 */
export interface ValidationResult {
  success: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

/**
 * Database claim record
 */
export interface ClaimRecord {
  distributorId: string;
  embeddedWallet: string;
  externalWallet: string;
  visitorId: string;
  ip: string;
  txId: string | null;
  amount: number;
}
/**
 * QuickNode drip intervals
 */
export type DripInterval =
  | "THIRTY_MINUTES"
  | "ONE_HOUR"
  | "TWELVE_HOURS"
  | "ONE_DAY";

/**
 * QuickNode rule with type-safe key-value pairs
 */
export type QuickNodeRule =
  | { key: "TOTAL_DRIP_PER_INTERVAL"; value: number }
  | { key: "TOTAL_DRIP_INTERVAL"; value: DripInterval }
  | { key: "DRIP_PER_INTERVAL"; value: number }
  | { key: "DRIP_INTERVAL"; value: DripInterval }
  | { key: "MAINNET_BALANCE"; value: number }
  | { key: "MAINNET_TRANSACTION_COUNT"; value: number }
  | { key: "DEFAULT_DRIP_AMOUNT"; value: number };

/**
 * QuickNode rules for configuration
 */
export interface QuickNodeRules {
  TOTAL_DRIP_PER_INTERVAL?: number;
  TOTAL_DRIP_INTERVAL?: DripInterval;
  DRIP_PER_INTERVAL?: number;
  DRIP_INTERVAL?: DripInterval;
  MAINNET_BALANCE?: number;
  MAINNET_TRANSACTION_COUNT?: number;
  DEFAULT_DRIP_AMOUNT?: number;
}

export type QuickNodeRuleKey = keyof QuickNodeRules;
