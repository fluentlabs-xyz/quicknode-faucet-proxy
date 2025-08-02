import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { queries, ensureClaimsTable } from "./db";
import { NFT_CONTRACT_ADDRESS, TOKEN_ID } from "./config";
import { validateNFTOwnership, verifyParaWalletAddress } from "./validate";
import { validateParaJwt } from "./jwt";
import { quickNodeService, type QuickNodeClaimRequest } from "./quicknode";

// Create tables at startup
await ensureClaimsTable();

// Bun-optimized claim processing function
async function processClaim(
  token: string,
  visitorId: string,
  request: Request
): Promise<any> {
  // Validate JWT first (fast fail)
  const jwtResult = await validateParaJwt(token);
  if (!jwtResult.valid) {
    throw { status: 401, message: "Invalid token", details: jwtResult.error };
  }

  // Extract wallets
  const { wallets, externalWallets } = jwtResult.payload.data || {};
  const embeddedWallet = wallets?.find((w: any) => w.type === "EVM")?.address;
  const externalWallet = externalWallets?.find(
    (w: any) => w.type === "EVM"
  )?.address;

  if (!embeddedWallet || !externalWallet) {
    throw { status: 400, message: "Wallets not found in token" };
  }

  // Parallel validation (Bun handles this efficiently)
  const [walletInfo, isNFTOwned, existingClaim] = await Promise.all([
    verifyParaWalletAddress(embeddedWallet, process.env.PARA_SECRET_KEY!),
    validateNFTOwnership(
      externalWallet,
      NFT_CONTRACT_ADDRESS as `0x${string}`,
      TOKEN_ID || "1"
    ),
    queries.checkExistingClaim(externalWallet),
  ]);

  // Validate results
  if (!walletInfo) {
    throw {
      status: 403,
      message: "Embedded wallet does not belong to this project",
    };
  }

  if (!isNFTOwned) {
    throw {
      status: 403,
      message: `NFT ownership validation failed for address ${externalWallet}`,
    };
  }

  if (existingClaim) {
    throw {
      status: 429,
      message:
        "This NFT owner has already claimed. Only one claim is allowed per NFT holder.",
    };
  }

  // Get client IP
  const cfConnectingIp =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "";

  // Prepare QuickNode claim request
  const claimRequest: QuickNodeClaimRequest = {
    address: embeddedWallet,
    ip: cfConnectingIp,
    visitorId,
  };

  // Submit claim using the service and get transaction status
  const { claimResponse, transactionStatus, finalTxHash } =
    await quickNodeService.processClaimWithStatus(
      claimRequest,
      3000, // Poll every 3 seconds
      10 // Max 10 attempts (30 seconds)
    );

  // Extract amount from response
  const amount = claimResponse.data?.amount || 1;

  // Save to database
  await queries.insertClaim({
    embeddedWallet,
    externalWallet,
    visitorId,
    ip: cfConnectingIp,
    txId: finalTxHash || claimResponse.transactionId || null,
    amount,
  });

  // Return a clean response to the client
  return {
    success: true,
    transactionId: claimResponse.transactionId,
    txHash: finalTxHash,
    amount,
    status: transactionStatus?.status || "pending",
    message: "Claim processed successfully",
  };
}

const app = new Elysia()
  .use(
    cors({
      origin: process.env.ALLOWED_ORIGINS?.split(","),
    })
  )
  .post("/claim", async ({ request, set }) => {
    try {
      // Parse request body
      const body = await request.json();
      const { visitorId } = body as { visitorId: string };

      if (!visitorId) {
        set.status = 400;
        return { error: "Missing visitorId (fingerprint)" };
      }

      // Extract and validate auth header
      const authHeader = request.headers.get("authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        set.status = 401;
        return { error: "Missing or invalid Authorization header" };
      }

      const token = authHeader.replace(/^Bearer\s+/i, "");

      // Process claim
      const result = await processClaim(token, visitorId, request);

      return result;
    } catch (error: any) {
      console.error("Claim processing error:", error);

      set.status = error.status || 500;
      return {
        error: error.message || "Server error",
        ...(error.details && { details: error.details }),
      };
    }
  })
  .get("/healthz", () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
  }))
  .get("/", () => ({
    service: "QuickNode Faucet Distributor",
    status: "running",
  }));

const port = Number(process.env.PORT || 8080);

app.listen({
  port,
  hostname: "0.0.0.0", // Important for Docker
});

console.log(`🚀 Partner API server running on port ${port}`);
console.log(`🔗 Health check: http://localhost:${port}/healthz`);
