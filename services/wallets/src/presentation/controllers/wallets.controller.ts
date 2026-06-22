import { Controller, Get, Post, UseGuards, Req, Res } from "@nestjs/common";
import { HealthCheckResponseDto } from "../dtos/health-check-response.dto";
import { WalletService } from "../../application/wallet.service";
import { JwtGuard } from "../../infrastructure/jwt.guard";
import type { Request, Response } from "express";

@Controller()
export class WalletsController {
  constructor(private readonly walletService: WalletService) {}

  @Get("health")
  check(): HealthCheckResponseDto {
    return { status: "ok", service: "wallets" };
  }

  // Kong strips /wallets prefix — routes below are relative to service root
  // Returns 201 on creation, 200 if wallet already existed (idempotent)
  @Post()
  @UseGuards(JwtGuard)
  async createWallet(
    @Req() req: Request & { playerId: string },
    @Res() res: Response,
  ) {
    const { wallet, created } = await this.walletService.createOrGet(req.playerId);
    res.status(created ? 201 : 200).json(wallet.toJSON());
  }

  @Get("me")
  @UseGuards(JwtGuard)
  async getMyWallet(@Req() req: Request & { playerId: string }) {
    const wallet = await this.walletService.getByPlayerId(req.playerId);
    return wallet.toJSON();
  }
}
