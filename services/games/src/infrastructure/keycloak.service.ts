import { Injectable, Logger } from "@nestjs/common";

const USERNAME_TTL_MS = 5 * 60 * 1000; // 5 min
const TOKEN_SKEW_MS = 30 * 1000; // renova 30s antes de expirar

/**
 * Resolve o `username` exibido em apostas consultando o Keycloak (CONTRACT §0).
 *
 * O Keycloak é a fonte única de verdade do username — ele **não** é persistido
 * junto da `Bet`. Para evitar latência e acoplamento ao IdP a cada leitura,
 * tanto o token de admin quanto o username por `playerId` são cacheados com TTL.
 *
 * Usa o Admin REST API com o usuário bootstrap (admin-cli, realm master),
 * cujas credenciais vêm de `KEYCLOAK_ADMIN_USER` / `KEYCLOAK_ADMIN_PASSWORD`.
 */
@Injectable()
export class KeycloakService {
  private readonly logger = new Logger(KeycloakService.name);
  private adminToken: { token: string; expiresAt: number } | null = null;
  private readonly usernameCache = new Map<string, { username: string; expiresAt: number }>();

  private get baseUrl(): string {
    return process.env.KEYCLOAK_URL!;
  }
  private get realm(): string {
    return process.env.KEYCLOAK_REALM!;
  }

  async getUsername(playerId: string): Promise<string> {
    const cached = this.usernameCache.get(playerId);
    if (cached && cached.expiresAt > Date.now()) return cached.username;

    try {
      const token = await this.getAdminToken();
      const res = await fetch(
        `${this.baseUrl}/admin/realms/${this.realm}/users/${playerId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error(`user lookup failed: ${res.status}`);
      const user = (await res.json()) as { username?: string };
      const username = user.username ?? playerId;
      this.usernameCache.set(playerId, { username, expiresAt: Date.now() + USERNAME_TTL_MS });
      return username;
    } catch (err) {
      // Resiliência: se o IdP estiver indisponível, não derruba o jogo.
      this.logger.warn(`Falha ao resolver username de ${playerId} no Keycloak: ${err}`);
      return playerId;
    }
  }

  private async getAdminToken(): Promise<string> {
    if (this.adminToken && this.adminToken.expiresAt > Date.now()) {
      return this.adminToken.token;
    }

    const body = new URLSearchParams({
      grant_type: "password",
      client_id: "admin-cli",
      username: process.env.KEYCLOAK_ADMIN_USER!,
      password: process.env.KEYCLOAK_ADMIN_PASSWORD!,
    });

    const res = await fetch(
      `${this.baseUrl}/realms/master/protocol/openid-connect/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      },
    );
    if (!res.ok) throw new Error(`admin token request failed: ${res.status}`);

    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.adminToken = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000 - TOKEN_SKEW_MS,
    };
    return this.adminToken.token;
  }
}
