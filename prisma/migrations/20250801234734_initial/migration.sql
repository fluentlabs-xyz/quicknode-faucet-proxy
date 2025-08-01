-- CreateTable
CREATE TABLE "public"."Claim" (
    "id" SERIAL NOT NULL,
    "embeddedWallet" VARCHAR(64) NOT NULL,
    "externalWallet" VARCHAR(64) NOT NULL,
    "visitorId" VARCHAR(64) NOT NULL,
    "ip" VARCHAR(64) NOT NULL,
    "txId" VARCHAR(128) NOT NULL,
    "amount" DOUBLE PRECISION DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Claim_embeddedWallet_createdAt_idx" ON "public"."Claim"("embeddedWallet", "createdAt");

-- CreateIndex
CREATE INDEX "Claim_externalWallet_createdAt_idx" ON "public"."Claim"("externalWallet", "createdAt");

-- CreateIndex
CREATE INDEX "Claim_visitorId_createdAt_idx" ON "public"."Claim"("visitorId", "createdAt");

-- CreateIndex
CREATE INDEX "Claim_ip_createdAt_idx" ON "public"."Claim"("ip", "createdAt");
