import { validateParaJwt } from "./lib/jwt";
import { validateNFTOwnership, verifyParaWalletAddress } from "./lib/validate";
import { quickNodeService } from "./lib/quicknode";
import { queries } from "./db/queries";
import { config } from "./config";
import {
  AuthError,
  ValidationError,
  ForbiddenError,
  ConflictError,
} from "./errors";
import type { ClaimRequest, ClaimResult } from "./types";

export async function processClaim(
  request: ClaimRequest
): Promise<ClaimResult> {
  // 1. Validate JWT
  const jwtResult = await validateParaJwt(request.token);
  if (!jwtResult.valid) {
    throw new AuthError("Invalid token", jwtResult.error);
  }

  // 2. Extract wallets from JWT
  const { wallets, externalWallets } = jwtResult.payload.data || {};
  const embeddedWallet = wallets?.find((w: any) => w.type === "EVM")?.address;
  const externalWallet = externalWallets?.find(
    (w: any) => w.type === "EVM"
  )?.address;

  if (!embeddedWallet || !externalWallet) {
    throw new ValidationError("EVM wallets not found in token");
  }

  // 3. Run validations in parallel
  const [walletInfo, isNFTOwned, existingClaim] = await Promise.all([
    config.paraSecretKey
      ? verifyParaWalletAddress(
          embeddedWallet,
          config.paraSecretKey,
          config.paraVerifyUrl
        )
      : Promise.resolve(true),
    validateNFTOwnership(
      externalWallet,
      config.nftContractAddress,
      config.tokenId
    ),
    queries.checkExistingClaim(externalWallet),
  ]);

  // 4. Check validation results
  if (config.paraSecretKey && !walletInfo) {
    throw new ForbiddenError("Embedded wallet does not belong to this project");
  }

  if (!isNFTOwned) {
    throw new ForbiddenError(
      `NFT ownership validation failed for address ${externalWallet}`
    );
  }

  if (existingClaim) {
    throw new ConflictError(
      "This NFT owner has already claimed. Only one claim is allowed per NFT holder."
    );
  }

  // 5. Submit claim to QuickNode
  const claimResponse = await quickNodeService.submitClaim({
    address: embeddedWallet,
    ip: request.clientIp,
    visitorId: request.visitorId,
  });

  if (!claimResponse.success) {
    throw new ValidationError(
      claimResponse.message || "Claim rejected by QuickNode"
    );
  }

  // 6. Save to database
  const amount = claimResponse.data?.amount || 1;
  await queries.insertClaim({
    distributorId: config.distributorId,
    embeddedWallet,
    externalWallet,
    visitorId: request.visitorId,
    ip: request.clientIp,
    txId: claimResponse.transactionId || null,
    amount,
  });

  // 7. Return result
  return {
    success: true,
    transactionId: claimResponse.transactionId,
    amount,
    status: "success",
    message: "Claim processed successfully",
  };
}
