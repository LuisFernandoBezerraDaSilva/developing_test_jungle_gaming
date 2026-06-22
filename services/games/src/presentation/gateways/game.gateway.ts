import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import jwksRsa from "jwks-rsa";
import { RoundEngineService } from "../../application/round-engine.service";
import { GameService } from "../../application/game.service";
import { multiplierAt } from "../../domain/provably-fair";

@WebSocketGateway({ namespace: "/game", cors: { origin: "*" } })
export class GameGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(GameGateway.name);
  private readonly jwksClient: jwksRsa.JwksClient;

  constructor(
    private readonly engine: RoundEngineService,
    private readonly gameService: GameService,
  ) {
    this.jwksClient = jwksRsa({
      jwksUri: `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/certs`,
      cache: true,
      cacheMaxAge: 86400000,
    });
  }

  afterInit(server: Server): void {
    this.engine.setServer(server);
    this.gameService.setGateway({
      emitToPlayer: (playerId, event, data) => {
        server.to(`player:${playerId}`).emit(event, data);
      },
      emitAll: (event, data) => {
        server.emit(event, data);
      },
    });
    this.logger.log("WebSocket /game initialized");
  }

  async handleConnection(client: Socket): Promise<void> {
    // Authenticate if token provided
    const token = client.handshake.auth?.token as string | undefined;
    if (token) {
      try {
        const decoded = await this.verifyToken(token);
        const playerId = (decoded as jwt.JwtPayload).sub!;
        await client.join(`player:${playerId}`);
        (client as any).playerId = playerId;
      } catch {
        this.logger.warn(`Socket ${client.id} sent invalid token — anonymous mode`);
      }
    }

    this.engine.onClientConnect();

    // Send snapshot
    try {
      const round = await this.engine.getOrLoadCurrentRound();
      if (round) {
        const bets = round.bets.map((b) => ({
          playerId: b.playerId,
          username: `player-${b.playerId.substring(0, 8)}`,
          amountCents: b.amountCents.toString(),
          status: b.status,
          cashoutMultiplier: b.cashoutMultiplier,
          payoutCents: b.payoutCents?.toString() ?? null,
        }));

        const currentMultiplier = round.phase === "RUNNING"
          ? multiplierAt((Date.now() - round.phaseStartedAt.getTime()) / 1000).toFixed(2)
          : "1.00";

        client.emit("round:snapshot", {
          type: "round:snapshot",
          payload: {
            roundId: round.id,
            phase: round.phase,
            phaseStartedAt: round.phaseStartedAt.toISOString(),
            bettingWindowSeconds: 10,
            currentMultiplier,
            serverHash: round.serverHash,
            bets,
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      this.logger.error(`Failed to send snapshot: ${err}`);
    }
  }

  handleDisconnect(client: Socket): void {
    this.engine.onClientDisconnect();
  }

  private verifyToken(token: string): Promise<jwt.JwtPayload> {
    return new Promise((resolve, reject) => {
      jwt.verify(token, this.getKey.bind(this), {}, (err, decoded) => {
        if (err) return reject(err);
        resolve(decoded as jwt.JwtPayload);
      });
    });
  }

  private getKey(
    header: jwt.JwtHeader,
    callback: (err: Error | null, key?: string) => void,
  ): void {
    this.jwksClient.getSigningKey(header.kid, (err, key) => {
      if (err) return callback(err);
      callback(null, key?.getPublicKey());
    });
  }
}
