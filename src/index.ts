import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";

import {
  DISTRIBUTOR_API_KEY,
  NFT_CONTRACT_ADDRESS,
  QUICKNODE_API,
  TOKEN_ID,
} from "./config";
import { validateNFTOwnership, verifyParaWalletAddress } from "./validate";
import { validateParaJwt } from "./jwt";

// Load environment variables
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(",") }));

const getClientIP = (req: express.Request) =>
  (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
  req.socket.remoteAddress;

app.post("/claim", async (req, res) => {
  try {
    const visitorId = req.body.visitorId;
    if (!visitorId) {
      return res.status(400).json({ error: "Missing visitorId (fingerprint)" });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ error: "Missing or invalid Authorization header" });
    }
    const token = authHeader.replace(/^Bearer\s+/i, "");

    const jwtResult = await validateParaJwt(token);
    if (!jwtResult.valid) {
      return res
        .status(401)
        .json({ error: "Invalid token", details: jwtResult.error });
    }

    const { wallets, externalWallets } = jwtResult.payload.data || {};
    const embeddedWallet = wallets?.find((w: any) => w.type === "EVM")?.address;
    const externalWallet = externalWallets?.find(
      (w: any) => w.type === "EVM"
    )?.address;

    if (!embeddedWallet || !externalWallet) {
      return res.status(400).json({ error: "Wallets not found in token" });
    }

    const walletInfo = await verifyParaWalletAddress(
      embeddedWallet,
      process.env.PARA_SECRET_KEY!
    );
    if (!walletInfo) {
      return res
        .status(403)
        .json({ error: "Embedded wallet does not belong to this project" });
    }
    console.log(`Para wallet verified: ${JSON.stringify(walletInfo)}`);

    const isNFTOwned = await validateNFTOwnership(
      externalWallet,
      NFT_CONTRACT_ADDRESS as `0x${string}`,
      TOKEN_ID || "1"
    );
    if (!isNFTOwned) {
      return res.status(403).json({
        error: `NFT ownership validation failed for address ${externalWallet}`,
      });
    }

    const ip = getClientIP(req);

    const response = await axios.post(
      `${QUICKNODE_API}/partners/distributors/claim`,
      { address: embeddedWallet, ip, visitorId },
      { headers: { "x-partner-api-key": DISTRIBUTOR_API_KEY } }
    );

    res.status(response.status).json(response.data);
  } catch (error: any) {
    res
      .status(error.response?.status || 500)
      .json(error.response?.data || { error: "Server error" });
  }
});

// Health check endpoint
app.get("/healthz", (_, res) => res.status(200).json({ status: "ok" }));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () =>
  console.log(`Partner API server running on port ${PORT}`)
);
