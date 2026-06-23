import { Module, OnModuleInit } from "@nestjs/common";
import { WalletsController } from "./presentation/controllers/wallets.controller";
import { PrismaService } from "./infrastructure/prisma.service";
import { RabbitMQService } from "./infrastructure/rabbitmq.service";
import { RedisService } from "./infrastructure/redis.service";
import { MetricsService } from "./infrastructure/metrics.service";
import { WalletPrismaRepository } from "./infrastructure/wallet.prisma-repository";
import { WalletService } from "./application/wallet.service";
import { WALLET_REPOSITORY } from "./domain/wallet.repository";
import { JwtGuard } from "./infrastructure/jwt.guard";

@Module({
  controllers: [WalletsController],
  providers: [
    PrismaService,
    RabbitMQService,
    RedisService,
    MetricsService,
    JwtGuard,
    { provide: WALLET_REPOSITORY, useClass: WalletPrismaRepository },
    WalletService,
  ],
})
export class AppModule implements OnModuleInit {
  constructor(private readonly walletService: WalletService) {}

  async onModuleInit(): Promise<void> {
    await this.walletService.startConsumers();
  }
}
