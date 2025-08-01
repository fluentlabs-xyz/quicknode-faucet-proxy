export const QUICKNODE_API = "https://api.faucet.quicknode.com";
export const PARTNER_API_KEY = process.env.PARTNER_API_KEY;
export const DISTRIBUTOR_API_KEY = process.env.DISTRIBUTOR_API_KEY;
export const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET;
export const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(",") || [];
export const NFT_CONTRACT_ADDRESS = process.env.NFT_CONTRACT_ADDRESS;
export const RPC_URL = process.env.RPC_URL || "https://rpc.dev.gblend.xyz";
export const TOKEN_ID = process.env.TOKEN_ID; // Default token ID if not set
