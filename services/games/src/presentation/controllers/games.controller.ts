import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  Query,
  Param,
} from "@nestjs/common";
import { HealthCheckResponseDto } from "../dtos/health-check-response.dto";
import { GameService } from "../../application/game.service";
import { JwtGuard } from "../../infrastructure/jwt.guard";
import type { Request } from "express";

@Controller()
export class GamesController {
  constructor(private readonly gameService: GameService) {}

  @Get("health")
  check(): HealthCheckResponseDto {
    return { status: "ok", service: "games" };
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
  @UseGuards(JwtGuard)
  async cashout(@Req() req: Request & { playerId: string }) {
    return this.gameService.cashout(req.playerId);
  }
}
