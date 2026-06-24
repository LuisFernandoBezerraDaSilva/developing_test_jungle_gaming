import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { RabbitMQService } from "./rabbitmq.service";

const POLL_INTERVAL_MS = 1000;
const BATCH_SIZE = 100;

/**
 * Relay do outbox (bônus). Publica no RabbitMQ os eventos gravados na tabela
 * `outbox_events` (na mesma transação do estado de domínio) e marca como
 * publicados. Usa o id da linha como `eventId` estável → republicações após
 * falha são deduplicadas pelo inbox (Redis) no consumidor (exactly-once efetivo).
 */
@Injectable()
export class OutboxRelay implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelay.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitmq: RabbitMQService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.flush().catch((err) => this.logger.error(`Outbox relay falhou: ${err}`));
    }, POLL_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Publica os eventos pendentes em ordem de criação e os marca publicados. */
  async flush(): Promise<void> {
    if (this.running) return; // evita sobreposição entre ticks
    this.running = true;
    try {
      const rows = await this.prisma.outboxEvent.findMany({
        where: { publishedAt: null },
        orderBy: { createdAt: "asc" },
        take: BATCH_SIZE,
      });
      for (const row of rows) {
        await this.rabbitmq.publish(row.routingKey, row.payload, row.id);
        await this.prisma.outboxEvent.update({
          where: { id: row.id },
          data: { publishedAt: new Date() },
        });
      }
    } finally {
      this.running = false;
    }
  }
}
