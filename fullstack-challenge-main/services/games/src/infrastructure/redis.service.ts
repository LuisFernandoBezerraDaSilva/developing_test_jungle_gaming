import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;

  onModuleInit(): void {
    this.client = new Redis(process.env.REDIS_URL!, { lazyConnect: false });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  async setNx(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.set(key, "1", "EX", ttlSeconds, "NX");
    return result === "OK";
  }
}
