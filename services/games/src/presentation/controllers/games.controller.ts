import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  Res,
  Query,
  Param,
  HttpCode,
} from "@nestjs/common";
import { HealthCheckResponseDto } from "../dtos/health-check-response.dto";
import { GameService } from "../../application/game.service";
import { JwtGuard } from "../../infrastructure/jwt.guard";
import { MetricsService } from "../../infrastructure/metrics.service";
import type { Request, Response } from "express";

@Controller()
export class GamesController {
  constructor(
    private readonly gameService: GameService,
    private readonly metrics: MetricsService,
  ) {}

  @Get("health")
  check(): HealthCheckResponseDto {
    return { status: "ok", service: "games" };
  }

  // Observabilidade (bônus) — scrapeado pelo Prometheus
  @Get("metrics")
  async getMetrics(@Res() res: Response): Promise<void> {
    res.setHeader("Content-Type", this.metrics.registry.contentType);
    res.send(await this.metrics.scrape());
  }

  // Kong strips /games prefix, so routes below are relative to service root
  @Get("rounds/current")
  async getCurrentRound() {
    return this.gameService.getCurrentRound();
  }

  @Get("rounds/history")
  async getRoundHistory(
    @Query("page") page = "1",
    @Query("limit") limit = "20",
  ) {
    return this.gameService.getRoundHistory(Number(page), Number(limit));
  }

  @Get("rounds/:roundId/verify")
  async verifyRound(@Param("roundId") roundId: string) {
    return this.gameService.verifyRound(roundId);
  }

  // Leaderboard (bônus) — top jogadores por lucro líquido no período
  @Get("leaderboard")
  async getLeaderboard(@Query("period") period = "24h") {
    const normalized = period === "week" ? "week" : "24h";
    return this.gameService.getLeaderboard(normalized);
  }

  @Get("bets/me")
  @UseGuards(JwtGuard)
  async getMyBets(
    @Req() req: Request & { playerId: string },
    @Query("page") page = "1",
    @Query("limit") limit = "20",
  ) {
    return this.gameService.getMyBets(req.playerId, Number(page), Number(limit));
  }

  @Post("bet")
  @UseGuards(JwtGuard)
  async placeBet(
    @Req() req: Request & { playerId: string },
    @Body() body: { amountCents: string },
  ) {
    return this.gameService.placeBet(req.playerId, body.amountCents);
  }

  @Post("bet/cashout")
  @HttpCode(200)
  @UseGuards(JwtGuard)
  async cashout(@Req() req: Request & { playerId: string }) {
    return this.gameService.cashout(req.playerId);
  }
}
