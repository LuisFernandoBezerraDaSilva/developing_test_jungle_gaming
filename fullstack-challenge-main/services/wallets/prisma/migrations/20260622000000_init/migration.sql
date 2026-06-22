-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "balanceCents" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallets_playerId_key" ON "wallets"("playerId");
