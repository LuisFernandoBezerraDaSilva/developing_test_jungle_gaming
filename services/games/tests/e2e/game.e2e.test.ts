import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { GamesController } from "../../src/presentation/controllers/games.controller";
import { GameService } from "../../src/application/game.service";
import { RoundEngineService } from "../../src/application/round-engine.service";
import { ROUND_REPOSITORY } from "../../src/domain/round.repository";
import { BET_REPOSITORY } from "../../src/domain/bet.repository";
import { RabbitMQService } from "../../src/infrastructure/rabbitmq.service";
import { RedisService } from "../../src/infrastructure/redis.service";
import { KeycloakService } from "../../src/infrastructure/keycloak.service";
import { JwtGuard } from "../../src/infrastructure/jwt.guard";
import {
  InMemoryBus,
  InMemoryRedis,
  InMemoryRoundRepository,
  InMemoryBetRepository,
  FakeEngine,
} from "./helpers";

/**
 * E2E (API layer) — Game Service.
 *
 * Boots the real NestJS app (controllers → application → domain) over HTTP.
 * Infra is replaced by in-memory fakes and the round engine by a deterministic
 * FakeEngine, so the 3 mandatory gameplay scenarios run without random crash
 * timing or Docker. The wallet side of "saldo atualizado" is covered jointly
 * by the wallet E2E, which consumes the round.settled events asserted here.
 *
 * The stubbed JWT guard treats the Bearer token as the playerId.
 */

const PORT = 4712;
const BASE = `http://127.0.0.1:${PORT}`;

let app: INestApplication;
let bus: InMemoryBus;
let engine: FakeEngine;
let roundRepo: InMemoryRoundRepository;

async function api(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

beforeAll(async () => {
  bus = new InMemoryBus();
  roundRepo = new InMemoryRoundRepository();
  const betRepo = new InMemoryBetRepository();
  engine = new FakeEngine(roundRepo, bus);

  const moduleRef = await Test.createTestingModule({
    controllers: [GamesController],
    providers: [
      GameService,
      { provide: ROUND_REPOSITORY, useValue: roundRepo },
      { provide: BET_REPOSITORY, useValue: betRepo },
      { provide: RabbitMQService, useValue: bus },
      { provide: RedisService, useValue: new InMemoryRedis() },
      { provide: RoundEngineService, useValue: engine },
      { provide: KeycloakService, useValue: { getUsername: async (id: string) => `user-${id}` } },
    ],
  })
    .overrideGuard(JwtGuard)
    .useValue({
      canActivate: (ctx: any) => {
        const req = ctx.switchToHttp().getRequest();
        const auth = req.headers["authorization"] as string | undefined;
        if (!auth?.startsWith("Bearer ")) return false;
        req.playerId = auth.slice(7);
        return true;
      },
    })
    .compile();

  app = moduleRef.createNestApplication({ logger: false });
  const gameService = moduleRef.get(GameService);
  await gameService.startConsumers(); // registers the wallet.debit.* consumer
  await app.listen(PORT, "127.0.0.1");
});

afterAll(async () => {
  await app?.close();
});

describe("Scenario 1 — bet → multiplier rises → cashout → settled WON", () => {
  it("places a bet, cashes out, and settles as WON with the locked payout", async () => {
    const player = "player-win";
    await engine.newBettingRound();

    const placed = await api("POST", "/bet", { token: player, body: { amountCents: "10000" } });
    expect(placed.status).toBe(201);
    expect(placed.body.status).toBe("PENDING");

    // Game publishes bet.placed (consumed by Wallet to debit)
    const betPlaced = bus.publishedOf("bet.placed");
    expect(betPlaced.length).toBe(1);
    expect((betPlaced[0].payload as any).amountCents).toBe("10000");

    await engine.startRunning("2.00");

    const cashout = await api("POST", "/bet/cashout", { token: player });
    expect(cashout.status).toBe(200);
    expect(cashout.body.cashoutMultiplier).toBe("2.00");
    expect(cashout.body.payoutCents).toBe("20000"); // 100,00 @ 2.00x

    await engine.crashAndSettle("5.00");

    const settled = bus
      .publishedOf("round.settled")
      .filter((e) => (e.payload as any).playerId === player);
    expect(settled.length).toBe(1);
    expect((settled[0].payload as any).outcome).toBe("WON");
    expect((settled[0].payload as any).payoutCents).toBe("20000");

    const mine = await api("GET", "/bets/me", { token: player });
    expect(mine.body.bets[0].status).toBe("WON");
    expect(mine.body.bets[0].cashoutMultiplier).toBe("2.00");
  });
});

describe("Scenario 2 — bet → crash → lost", () => {
  it("settles an un-cashed bet as LOST with zero payout", async () => {
    const player = "player-lose";
    await engine.newBettingRound();

    const placed = await api("POST", "/bet", { token: player, body: { amountCents: "10000" } });
    expect(placed.status).toBe(201);

    await engine.startRunning("3.00");
    // player does NOT cash out
    await engine.crashAndSettle("1.50");

    const settled = bus
      .publishedOf("round.settled")
      .filter((e) => (e.payload as any).playerId === player);
    expect(settled.length).toBe(1);
    expect((settled[0].payload as any).outcome).toBe("LOST");
    expect((settled[0].payload as any).payoutCents).toBe("0");

    const mine = await api("GET", "/bets/me", { token: player });
    expect(mine.body.bets[0].status).toBe("LOST");
    expect(mine.body.bets[0].payoutCents).toBe("0");
  });
});

describe("Scenario 3 — validation & saga errors", () => {
  it("rejects a duplicate bet from the same player (BET_ALREADY_PLACED)", async () => {
    const player = "player-dup";
    await engine.newBettingRound();

    const first = await api("POST", "/bet", { token: player, body: { amountCents: "10000" } });
    expect(first.status).toBe(201);

    const second = await api("POST", "/bet", { token: player, body: { amountCents: "10000" } });
    expect(second.status).toBe(400);
    expect(second.body.error).toBe("BET_ALREADY_PLACED");
  });

  it("rejects a bet while the round is running (ROUND_NOT_IN_BETTING_PHASE)", async () => {
    await engine.newBettingRound();
    await engine.startRunning("1.20");

    const res = await api("POST", "/bet", { token: "player-late", body: { amountCents: "10000" } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ROUND_NOT_IN_BETTING_PHASE");
  });

  it("rejects an out-of-range bet amount (BET_AMOUNT_OUT_OF_RANGE)", async () => {
    await engine.newBettingRound();
    const tooLow = await api("POST", "/bet", { token: "player-range", body: { amountCents: "50" } });
    expect(tooLow.status).toBe(400);
    expect(tooLow.body.error).toBe("BET_AMOUNT_OUT_OF_RANGE");
  });

  it("rejects cashout without a pending bet (NO_PENDING_BET)", async () => {
    await engine.newBettingRound();
    await engine.startRunning("1.50");
    const res = await api("POST", "/bet/cashout", { token: "player-nobet" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("NO_PENDING_BET");
  });

  it("compensates with REJECTED when the wallet reports insufficient balance (saga)", async () => {
    const player = "player-poor";
    await engine.newBettingRound();

    const placed = await api("POST", "/bet", { token: player, body: { amountCents: "10000" } });
    expect(placed.status).toBe(201);
    const betId = placed.body.betId;

    // Wallet publishes the failure → Game consumer compensates the bet
    await bus.publish("wallet.debit.failed", {
      betId,
      playerId: player,
      amountCents: "10000",
      reason: "INSUFFICIENT_BALANCE",
    });

    const mine = await api("GET", "/bets/me", { token: player });
    expect(mine.body.bets[0].status).toBe("REJECTED");
  });
});

describe("Read endpoints", () => {
  it("GET /rounds/current returns the active round snapshot with Keycloak-resolved usernames", async () => {
    await engine.newBettingRound();
    await api("POST", "/bet", { token: "player-snap", body: { amountCents: "10000" } });

    const res = await api("GET", "/rounds/current");
    expect(res.status).toBe(200);
    expect(res.body.phase).toBe("BETTING");
    expect(typeof res.body.serverHash).toBe("string");
    // username não é derivado localmente — vem do KeycloakService (fake: user-<id>)
    expect(res.body.bets[0].username).toBe("user-player-snap");
  });

  it("GET /rounds/:id/verify reveals serverSeed only AFTER the crash (commit-reveal)", async () => {
    const round = await engine.newBettingRound();
    await engine.startRunning("2.00");

    // Rodada ainda ativa (RUNNING): só o commit (hash), seed NÃO revelado
    const active = await api("GET", `/rounds/${round.id}/verify`);
    expect(active.status).toBe(200);
    expect(active.body.serverHash).toBeDefined();
    expect(active.body.serverSeed).toBeNull();
    expect(active.body.crashMultiplier).toBeNull();

    await engine.crashAndSettle("2.00");

    // Após o crash: seed revelado e recomputável a partir do hash
    const settled = await api("GET", `/rounds/${round.id}/verify`);
    expect(settled.status).toBe(200);
    expect(settled.body.clientSeed).toBe("crash-game-public-seed");
    expect(typeof settled.body.serverSeed).toBe("string");
    expect(settled.body.crashMultiplier).toBe("2.00");
  });
});
