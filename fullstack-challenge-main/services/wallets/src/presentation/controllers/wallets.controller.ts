import { Controller, Get, Post, UseGuards, Req, HttpCode } from "@nestjs/common";
import { HealthCheckResponseDto } from "../dtos/health-check-response.dto";
import { WalletService } from "../../application/wallet.service";
import { JwtGuard } from "../../infrastructure/jwt.guard";
import type { Request } from "express";

@Controller()
export class WalletsController {
  constructor(private readonly walletService: WalletService) {}

  @Get("health")
  check(): HealthCheckResponseDto {
    return { status: "ok", service: "wallets" };
  }

  // Kong strips /wallets prefix — routes below are relative to service root
  @Post()
  @HttpCode(201)
  @UseGuards(JwtGuard)
  async createWallet(@Req() req: Request & { playerId: string }) {
    const wallet = await this.walletService.createOrGet(req.playerId);
    return wallet.toJSON();
  }

  @Get("me")
  @UseGuards(JwtGuard)
  async getMyWallet(@Req() req: Request & { playerId: string }) {
    const wallet = await this.walletService.getByPlayerId(req.playerId);
    return wallet.toJSON();
  }
}
