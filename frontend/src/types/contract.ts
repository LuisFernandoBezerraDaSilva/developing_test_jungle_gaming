/**
 * Tipos derivados de docs/CONTRACT.md (v1.1) — fonte única de verdade.
 *
 * NÃO inferir formatos. Qualquer divergência aqui quebra a integração com o
 * backend (gerado em paralelo). Valores monetários e multiplicadores SEMPRE
 * chegam como `string` (centavos / "x.xx"); nunca como `number`.
 */

// ------------------------------------------------------------------ //
// Erros padronizados (§0)                                            //
// ------------------------------------------------------------------ //

export type ApiErrorCode =
  | 'INSUFFICIENT_BALANCE'
  | 'BET_ALREADY_PLACED'
  | 'ROUND_NOT_IN_BETTING_PHASE'
  | 'ROUND_NOT_RUNNING'
  | 'NO_PENDING_BET'
  | 'BET_AMOUNT_OUT_OF_RANGE'
  | 'WALLET_NOT_FOUND'
  | 'ROUND_NOT_FOUND'
  | 'UNAUTHORIZED';

export type ApiError = {
  statusCode: number;
  error: ApiErrorCode | string;
  message: string;
};

// ------------------------------------------------------------------ //
// Domínio                                                            //
// ------------------------------------------------------------------ //

export type RoundPhase = 'BETTING' | 'RUNNING' | 'CRASHED' | 'SETTLED';

export type BetStatus =
  | 'PENDING'
  | 'CASHED_OUT'
  | 'WON'
  | 'LOST'
  | 'REJECTED';

// ------------------------------------------------------------------ //
// Wallet Service — REST (§1)                                         //
// ------------------------------------------------------------------ //

export type WalletResponse = {
  id: string;
  playerId: string;
  balanceCents: string; // ex: "10000" = R$100,00
  currency: 'BRL';
  createdAt: string;
  updatedAt: string;
};

// ------------------------------------------------------------------ //
// Game Service — REST (§2)                                           //
// ------------------------------------------------------------------ //

export type RoundBet = {
  playerId: string;
  username: string;
  amountCents: string;
  status: Exclude<BetStatus, 'REJECTED'>;
  cashoutMultiplier: string | null;
  payoutCents: string | null;
};

export type CurrentRoundResponse = {
  roundId: string;
  phase: RoundPhase;
  phaseStartedAt: string;
  bettingWindowSeconds: number;
  currentMultiplier: string; // só relevante se phase === RUNNING
  serverHash: string;
  bets: RoundBet[];
};

export type RoundHistoryItem = {
  roundId: string;
  crashMultiplier: string;
  crashedAt: string;
  totalBets: number;
  totalWagered: string;
};

export type RoundHistoryResponse = {
  rounds: RoundHistoryItem[];
  page: number;
  limit: number;
  total: number;
};

export type VerifyResponse = {
  roundId: string;
  serverSeed: string | null; // revelado só após o crash (CRASHED/SETTLED)
  serverHash: string;
  clientSeed: string;
  nonce: number;
  crashMultiplier: string | null; // null enquanto a rodada não crashou
};

// Leaderboard (bônus) — top jogadores por lucro líquido no período.
export type LeaderboardEntry = {
  rank: number;
  playerId: string;
  username: string;
  profitCents: string; // pode ser negativo (string), ex: "-10000"
  totalBets: number;
};

export type LeaderboardResponse = {
  period: '24h' | 'week';
  entries: LeaderboardEntry[];
};

export type MyBet = {
  roundId: string;
  amountCents: string;
  status: BetStatus;
  cashoutMultiplier: string | null;
  payoutCents: string | null;
  createdAt: string;
};

export type MyBetsResponse = {
  bets: MyBet[];
  page: number;
  limit: number;
  total: number;
};

export type PlaceBetRequest = {
  amountCents: string; // "100"–"100000"
};

export type PlaceBetResponse = {
  betId: string;
  roundId: string;
  amountCents: string;
  status: 'PENDING';
};

export type CashoutResponse = {
  betId: string;
  cashoutMultiplier: string;
  payoutCents: string;
};

// ------------------------------------------------------------------ //
// WebSocket — Server → Client (§5)                                   //
// ------------------------------------------------------------------ //

/** Envelope comum dos eventos WS: `{ type, payload, timestamp }`. */
export type WsEnvelope<T> = {
  type: string;
  payload: T;
  timestamp: string;
};

/** Mesmo shape de CurrentRoundResponse. */
export type RoundSnapshotPayload = CurrentRoundResponse;

export type RoundBettingStartedPayload = {
  roundId: string;
  bettingWindowSeconds: number;
  serverHash: string;
};

export type RoundStartedPayload = {
  roundId: string;
  startedAt: string;
};

export type RoundTickPayload = {
  roundId: string;
  multiplier: string;
};

export type RoundCrashedPayload = {
  roundId: string;
  crashMultiplier: string;
  serverSeed: string;
  serverHash: string;
  clientSeed: string;
  nonce: number;
};

export type BetPlacedPayload = {
  roundId: string;
  playerId: string;
  username: string;
  amountCents: string;
};

export type BetCashedOutPayload = {
  roundId: string;
  playerId: string;
  username: string;
  cashoutMultiplier: string;
  payoutCents: string;
};

export type BetRejectedPayload = {
  betId: string;
  reason: string;
};

/** Mapa nome-do-evento → payload, para tipar o client socket.io. */
export type ServerToClientEvents = {
  'round:snapshot': (e: WsEnvelope<RoundSnapshotPayload>) => void;
  'round:betting_started': (e: WsEnvelope<RoundBettingStartedPayload>) => void;
  'round:started': (e: WsEnvelope<RoundStartedPayload>) => void;
  'round:tick': (e: WsEnvelope<RoundTickPayload>) => void;
  'round:crashed': (e: WsEnvelope<RoundCrashedPayload>) => void;
  'bet:placed': (e: WsEnvelope<BetPlacedPayload>) => void;
  'bet:cashed_out': (e: WsEnvelope<BetCashedOutPayload>) => void;
  'bet:rejected': (e: WsEnvelope<BetRejectedPayload>) => void;
};
