import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import jwt from "jsonwebtoken";
import jwksRsa from "jwks-rsa";
import type { Request } from "express";

@Injectable()
export class JwtGuard implements CanActivate {
  private readonly jwksClient: jwksRsa.JwksClient;

  constructor() {
    const keycloakUrl = process.env.KEYCLOAK_URL!;
    const realm = process.env.KEYCLOAK_REALM!;
    this.jwksClient = jwksRsa({
      jwksUri: `${keycloakUrl}/realms/${realm}/protocol/openid-connect/certs`,
      cache: true,
      cacheMaxAge: 86400000,
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { playerId?: string }>();
    const auth = req.headers["authorization"];
    if (!auth || !auth.startsWith("Bearer ")) {
      throw new UnauthorizedException({ statusCode: 401, error: "UNAUTHORIZED", message: "Missing token" });
    }

    const token = auth.slice(7);
    try {
      const decoded = await this.verifyToken(token);
      req.playerId = decoded.sub as string;
      return true;
    } catch {
      throw new UnauthorizedException({ statusCode: 401, error: "UNAUTHORIZED", message: "Invalid token" });
    }
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
