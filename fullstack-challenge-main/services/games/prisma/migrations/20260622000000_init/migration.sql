-- CreateTable
CREATE TABLE "rounds" (
    "id" TEXT NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'BETTING',
    "serverSeed" TEXT NOT NULL,
    "serverHash" TEXT NOT NULL,
    "clientSeed" TEXT NOT NULL DEFAULT 'crash-game-public-seed',
    "nonce" INTEGER NOT NULL,
    "crashMultiplier" TEXT,
    "phaseStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "crashedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bets" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "cashoutMultiplier" TEXT,
    "payoutCents" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bets_roundId_playerId_key" ON "bets"("roundId", "playerId");

-- AddForeignKey
ALTER TABLE "bets" ADD CONSTRAINT "bets_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
