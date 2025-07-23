import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";

// Load environment variables
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(",") }));

const QUICKNODE_API = "https://api.faucet.quicknode.com";
const DISTRIBUTOR_API_KEY = process.env.DISTRIBUTOR_API_KEY;
const PARTNER_API_KEY = process.env.PARTNER_API_KEY;
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET;

const validateRecaptcha = async (token: string) => {
  const res = await axios.post(
    `https://www.google.com/recaptcha/api/siteverify`,
    new URLSearchParams({
      secret: RECAPTCHA_SECRET!,
      response: token,
    }),
  );
  return res.data.success && res.data.score >= 0.8;
};

// const validateRecaptcha = async (token: string) => {
//   return true;
// };

const getClientIP = (req: express.Request) =>
  (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
  req.socket.remoteAddress;

app.post("/api/claim", async (req, res) => {
  const { address, recaptchaToken, visitorId } = req.body;
  if (!address || !recaptchaToken || !visitorId)
    return res.status(400).json({ error: "Missing fields" });

  if (!(await validateRecaptcha(recaptchaToken)))
    return res.status(403).json({ error: "Invalid reCaptcha" });

  const ip = getClientIP(req);

  try {
    const response = await axios.post(
      `${QUICKNODE_API}/partners/distributors/claim`,
      { address, visitorId, ip },
      { headers: { "x-partner-api-key": DISTRIBUTOR_API_KEY } }
    );

    res.status(response.status).json(response.data);
  } catch (error: any) {
    res
      .status(error.response?.status || 500)
      .json(error.response?.data || { error: "Server error" });
  }
});

app.post("/api/can-claim", async (req, res) => {
  const { address, visitorId } = req.body;
  if (!address || !visitorId)
    return res.status(400).json({ error: "Missing fields" });

  const ip = getClientIP(req);

  try {
    const response = await axios.post(
      `${QUICKNODE_API}/partners/distributors/can-claim`,
      { address, visitorId, ip },
      { headers: { "x-partner-api-key": DISTRIBUTOR_API_KEY } }
    );

    res.status(response.status).json(response.data);
  } catch (error: any) {
    res
      .status(error.response?.status || 500)
      .json(error.response?.data || { error: "Server error" });
  }
});

app.get("/api/claim/:transactionId", async (req, res) => {
  const { transactionId } = req.params;
  if (!transactionId)
    return res.status(400).json({ error: "Missing transaction ID" });

  try {
    const response = await axios.get(
      `${QUICKNODE_API}/partners/distributors/claim`,
      {
        params: { transactionId },
        headers: { "x-partner-api-key": DISTRIBUTOR_API_KEY },
      }
    );

    res.status(response.status).json(response.data);
  } catch (error: any) {
    res
      .status(error.response?.status || 500)
      .json(error.response?.data || { error: "Server error" });
  }
});

// Optional Admin Endpoints

app.post("/api/codes", async (req, res) => {
  const codesAmount = Math.min(req.body.amount || 1, 100);

  try {
    const response = await axios.post(
      `${QUICKNODE_API}/partners/distributors/code`,
      { amount: codesAmount },
      { headers: { "x-partner-api-key": DISTRIBUTOR_API_KEY } }
    );

    res.status(response.status).json(response.data);
  } catch (error: any) {
    res
      .status(error.response?.status || 500)
      .json(error.response?.data || { error: "Server error" });
  }
});

app.post("/api/wallets/ban", async (req, res) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: "Missing address" });

  try {
    const response = await axios.post(
      `${QUICKNODE_API}/partners/distributors/wallets/${address}`,
      { isValid: false },
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
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
