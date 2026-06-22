import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from "@nestjs/common";
import * as amqp from "amqplib";

const EXCHANGE = "crash-game.events";
const DLQ = "crash-game.events.dlq";
const MAX_RETRIES = 5;

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private connection: amqp.Connection;
  private channel: amqp.Channel;

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  private async connect(): Promise<void> {
    this.connection = await amqp.connect(process.env.RABBITMQ_URL!);
    this.channel = await this.connection.createChannel();

    await this.channel.assertExchange(EXCHANGE, "topic", { durable: true });
    await this.channel.assertExchange(`${EXCHANGE}.dlx`, "fanout", { durable: true });
    await this.channel.assertQueue(DLQ, { durable: true });
    await this.channel.bindQueue(DLQ, `${EXCHANGE}.dlx`, "#");
  }

  async publish<T>(routingKey: string, payload: T): Promise<void> {
    const envelope = {
      eventId: crypto.randomUUID(),
      eventType: routingKey,
      occurredAt: new Date().toISOString(),
      payload,
    };
    this.channel.publish(
      EXCHANGE,
      routingKey,
      Buffer.from(JSON.stringify(envelope)),
      { persistent: true },
    );
  }

  async consume(
    queue: string,
    routingKeys: string[],
    handler: (envelope: { eventId: string; eventType: string; occurredAt: string; payload: unknown }) => Promise<void>,
  ): Promise<void> {
    await this.channel.assertQueue(queue, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": `${EXCHANGE}.dlx`,
        "x-queue-type": "quorum",
        "x-delivery-limit": MAX_RETRIES,
      },
    });

    for (const key of routingKeys) {
      await this.channel.bindQueue(queue, EXCHANGE, key);
    }

    await this.channel.prefetch(1);

    await this.channel.consume(queue, async (msg) => {
      if (!msg) return;
      try {
        const envelope = JSON.parse(msg.content.toString());
        await handler(envelope);
        this.channel.ack(msg);
      } catch (err) {
        this.logger.error(`Failed to process message: ${err}`);
        this.channel.nack(msg, false, true);
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.channel.close();
      await this.connection.close();
    } catch {}
  }
}
