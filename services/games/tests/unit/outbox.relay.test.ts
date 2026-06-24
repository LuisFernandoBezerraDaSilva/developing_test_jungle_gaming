import { describe, it, expect } from "bun:test";
import { OutboxRelay } from "../../src/infrastructure/outbox.relay";

type Row = {
  id: string;
  routingKey: string;
  payload: unknown;
  createdAt: Date;
  publishedAt: Date | null;
};

function makeRelay() {
  const rows: Row[] = [
    { id: "row-1", routingKey: "bet.placed", payload: { a: 1 }, createdAt: new Date(1), publishedAt: null },
    { id: "row-2", routingKey: "round.settled", payload: { b: 2 }, createdAt: new Date(2), publishedAt: null },
  ];
  const published: { rk: string; payload: unknown; eventId?: string }[] = [];
  const updated: string[] = [];

  const prisma = {
    outboxEvent: {
      findMany: async () =>
        rows.filter((r) => r.publishedAt === null).sort((a, b) => +a.createdAt - +b.createdAt),
      update: async ({ where, data }: { where: { id: string }; data: { publishedAt: Date } }) => {
        const row = rows.find((r) => r.id === where.id);
        if (row) row.publishedAt = data.publishedAt;
        updated.push(where.id);
      },
    },
  };
  const rabbitmq = {
    publish: async (rk: string, payload: unknown, eventId?: string) => {
      published.push({ rk, payload, eventId });
    },
  };

  const relay = new OutboxRelay(prisma as never, rabbitmq as never);
  return { relay, published, updated };
}

describe("OutboxRelay", () => {
  it("publishes pending events with the row id as a STABLE eventId, then marks them published", async () => {
    const { relay, published, updated } = makeRelay();
    await relay.flush();

    expect(published).toEqual([
      { rk: "bet.placed", payload: { a: 1 }, eventId: "row-1" },
      { rk: "round.settled", payload: { b: 2 }, eventId: "row-2" },
    ]);
    expect(updated).toEqual(["row-1", "row-2"]);
  });

  it("does nothing once all events are published (no duplicate publish)", async () => {
    const { relay, published } = makeRelay();
    await relay.flush();
    published.length = 0;
    await relay.flush();
    expect(published.length).toBe(0);
  });
});
