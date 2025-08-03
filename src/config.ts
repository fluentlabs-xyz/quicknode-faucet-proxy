export const config = {
  // Server
  port: Number(Bun.env.PORT || 8080),
  allowedOrigins: Bun.env.ALLOWED_ORIGINS?.split(",") || [
    "http://localhost:3000",
  ],

  // Database
  databaseUrl: Bun.env.DATABASE_URL!,

  // QuickNode
  quicknodeApi: Bun.env.QUICKNODE_API || "https://api.faucet.quicknode.com",
  distributorApiKey: Bun.env.DISTRIBUTOR_API_KEY!,
  distributorId: Bun.env.DISTRIBUTOR_ID!,

  // Blockchain
  rpcUrl: Bun.env.RPC_URL,
  nftContractAddress: Bun.env.NFT_CONTRACT_ADDRESS!,
  tokenId: Bun.env.TOKEN_ID!,

  // Para
  paraSecretKey: Bun.env.PARA_SECRET_KEY || null,
  paraJwksUrl: Bun.env.PARA_JWKS_URL!,
  paraVerifyUrl: Bun.env.PARA_VERIFY_URL!,
} as const;

// Validate required config
const requiredKeys = [
  "distributorApiKey",
  "nftContractAddress",
  "paraJwksUrl",
  "paraVerifyUrl",
  "rpcUrl",
  "tokenId",
  "databaseUrl",
  "distributorId",
] as const;

for (const key of requiredKeys) {
  if (!config[key]) {
    throw new Error(
      `Missing required environment variable: ${key.toUpperCase()}`
    );
  }
}

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
