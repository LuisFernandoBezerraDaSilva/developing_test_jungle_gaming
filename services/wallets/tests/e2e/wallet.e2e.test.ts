import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { WalletsController } from "../../src/presentation/controllers/wallets.controller";
import { WalletService } from "../../src/application/wallet.service";
import { WALLET_REPOSITORY } from "../../src/domain/wallet.repository";
import { RabbitMQService } from "../../src/infrastructure/rabbitmq.service";
import { RedisService } from "../../src/infrastructure/redis.service";
import { MetricsService } from "../../src/infrastructure/metrics.service";
import { JwtGuard } from "../../src/infrastructure/jwt.guard";
import { InMemoryBus, InMemoryRedis, InMemoryWalletRepository } from "./helpers";

/**
 * E2E (API layer) — Wallet Service.
 *
 * Boots the real NestJS app (controllers → application → domain) over HTTP,
 * with infra (Prisma/RabbitMQ/Redis/Keycloak) replaced by in-memory fakes so
 * the saga and balance flows are exercised deterministically without Docker.
 *
 * The stubbed JWT guard treats the Bearer token as the playerId.
 */

const PORT = 4711;
const BASE = `http://127.0.0.1:${PORT}`;
const PLAYER = "00000000-0000-0000-0000-000000000001";

let app: INestApplication;
let bus: InMemoryBus;
let repo: InMemoryWalletRepository;
let service: WalletService;

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
  repo = new InMemoryWalletRepository(bus);

  const moduleRef = await Test.createTestingModule({
    controllers: [WalletsController],
    providers: [
      WalletService,
      { provide: WALLET_REPOSITORY, useValue: repo },
      { provide: RabbitMQService, useValue: bus },
      { provide: RedisService, useValue: new InMemoryRedis() },
      MetricsService,
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
  service = moduleRef.get(WalletService);
  await service.startConsumers();
  await app.listen(PORT, "127.0.0.1");
});

afterAll(async () => {
  await app?.close();
});

describe("Wallet REST", () => {
  it("POST /wallets returns 201 on creation, 200 when it already exists (idempotent)", async () => {
    const first = await api("POST", "/", { token: "player-new" });
    expect(first.status).toBe(201);
    expect(first.body.playerId).toBe("player-new");
    expect(first.body.balanceCents).toBe("0");
    expect(first.body.currency).toBe("BRL");

    const second = await api("POST", "/", { token: "player-new" });
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
  });

  it("GET /wallets/me returns the wallet with balanceCents serialized as string", async () => {
    repo.seed("player-me", 50000n);
    const res = await api("GET", "/me", { token: "player-me" });
    expect(res.status).toBe(200);
    expect(res.body.balanceCents).toBe("50000");
    expect(typeof res.body.balanceCents).toBe("string");
  });

  it("GET /wallets/me returns 404 WALLET_NOT_FOUND when absent", async () => {
    const res = await api("GET", "/me", { token: "ghost" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("WALLET_NOT_FOUND");
  });

  it("rejects unauthenticated requests", async () => {
    const res = await api("GET", "/me");
    expect(res.status).toBe(403);
  });
});

describe("Saga consumer — debit on bet.placed", () => {
  it("debits the wallet and emits wallet.debit.succeeded when balance is sufficient", async () => {
    repo.seed(PLAYER, 100000n); // R$1.000,00
    await bus.publish("bet.placed", {
      betId: "bet-1",
      roundId: "round-1",
      playerId: PLAYER,
      amountCents: "30000",
    });

    const wallet = await repo.findByPlayerId(PLAYER);
    expect(wallet!.balanceCents).toBe(70000n);

    const succeeded = bus.publishedOf("wallet.debit.succeeded");
    expect(succeeded.length).toBe(1);
    expect((succeeded[0].payload as any).betId).toBe("bet-1");
    expect(bus.publishedOf("wallet.debit.failed").length).toBe(0);
  });

  it("emits wallet.debit.failed (INSUFFICIENT_BALANCE) and leaves balance untouched", async () => {
    repo.seed("poor", 5000n); // R$50,00
    await bus.publish("bet.placed", {
      betId: "bet-2",
      roundId: "round-1",
      playerId: "poor",
      amountCents: "100000", // R$1.000,00 > saldo
    });

    const wallet = await repo.findByPlayerId("poor");
    expect(wallet!.balanceCents).toBe(5000n); // inalterado

    const failed = bus
      .publishedOf("wallet.debit.failed")
      .filter((e) => (e.payload as any).betId === "bet-2");
    expect(failed.length).toBe(1);
    expect((failed[0].payload as any).reason).toBe("INSUFFICIENT_BALANCE");
  });
});

describe("Saga consumer — credit on round.settled", () => {
  it("credits payoutCents when outcome is WON", async () => {
    const wallet = repo.seed("winner", 0n);
    await bus.publish("round.settled", {
      betId: "bet-3",
      roundId: "round-1",
      playerId: "winner",
      outcome: "WON",
      amountCents: "10000",
      payoutCents: "23500", // 100,00 @ 2.35x
    });
    expect(wallet.balanceCents).toBe(23500n);
  });

  it("does NOT credit when outcome is LOST", async () => {
    const wallet = repo.seed("loser", 8000n);
    await bus.publish("round.settled", {
      betId: "bet-4",
      roundId: "round-1",
      playerId: "loser",
      outcome: "LOST",
      amountCents: "8000",
      payoutCents: "0",
    });
    expect(wallet.balanceCents).toBe(8000n);
  });
});

describe("Idempotency (inbox)", () => {
  it("processes an event only once even if delivered twice (same eventId)", async () => {
    repo.seed("idem", 100000n);
    const payload = {
      betId: "bet-idem",
      roundId: "round-1",
      playerId: "idem",
      amountCents: "20000",
    };
    await bus.deliver("bet.placed", payload, "evt-dup");
    await bus.deliver("bet.placed", payload, "evt-dup"); // duplicate

    const wallet = await repo.findByPlayerId("idem");
    expect(wallet!.balanceCents).toBe(80000n); // debitado uma única vez
  });
});
