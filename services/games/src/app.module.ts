import { Module, OnModuleInit } from "@nestjs/common";
import { GamesController } from "./presentation/controllers/games.controller";
import { GameGateway } from "./presentation/gateways/game.gateway";
import { PrismaService } from "./infrastructure/prisma.service";
import { RabbitMQService } from "./infrastructure/rabbitmq.service";
import { RedisService } from "./infrastructure/redis.service";
import { RoundPrismaRepository } from "./infrastructure/round.prisma-repository";
import { BetPrismaRepository } from "./infrastructure/bet.prisma-repository";
import { RoundEngineService } from "./application/round-engine.service";
import { GameService } from "./application/game.service";
import { JwtGuard } from "./infrastructure/jwt.guard";
import { ROUND_REPOSITORY } from "./domain/round.repository";
import { BET_REPOSITORY } from "./domain/bet.repository";

@Module({
  controllers: [GamesController],
  providers: [
    PrismaService,
    RabbitMQService,
    RedisService,
    JwtGuard,
    { provide: ROUND_REPOSITORY, useClass: RoundPrismaRepository },
    { provide: BET_REPOSITORY, useClass: BetPrismaRepository },
    RoundEngineService,
    GameService,
    GameGateway,
  ],
})
export class AppModule implements OnModuleInit {
  constructor(private readonly gameService: GameService) {}

  async onModuleInit(): Promise<void> {
    await this.gameService.startConsumers();
  }
}
