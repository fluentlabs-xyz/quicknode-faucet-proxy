export interface GlobalConfig {
  quicknode_api_url: string;
  distributors: {
    [path: string]: DistributorConfig;
  };
}

export interface DistributorConfig {
  path: string;
  distributorId: string;
  distributorApiKey: string;
  dripAmount: number;
  validators?: Record<string, Record<string, unknown>>;
  erc20Config?: ERC20Config; 
}

export interface ERC20Config {
  tokenAddress: string;
  amount: string; // Amount in human-readable format (e.g., "100.5")
  privateKey: string;
  rpcUrl: string;
  chainId?: number;
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
  // optional wallet address for the direct implementation
  walletAddress?: `0x${string}`;
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
      erc20TxID?: string; 
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
