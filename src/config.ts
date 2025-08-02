import dotenv from "dotenv";
dotenv.config(); 

export const QUICKNODE_API = "https://api.faucet.quicknode.com";
export const DISTRIBUTOR_API_KEY = process.env.DISTRIBUTOR_API_KEY!;
export const NFT_CONTRACT_ADDRESS = process.env.NFT_CONTRACT_ADDRESS!;
export const RPC_URL = process.env.RPC_URL || "https://rpc.dev.gblend.xyz";
export const TOKEN_ID = process.env.TOKEN_ID || "1";
export const PARA_SECRET_KEY = process.env.PARA_SECRET_KEY!;
export const PARA_JWKS_URL = process.env.PARA_JWKS_URL!;
export const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(",") || [];
export const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:password@localhost:5432/postgres";
