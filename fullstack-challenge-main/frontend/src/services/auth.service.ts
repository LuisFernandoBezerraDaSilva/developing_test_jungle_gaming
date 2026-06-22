import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts';
import { env } from '@/config/env';

/**
 * Serviço de autenticação — OIDC authorization code flow + PKCE (S256) contra
 * o Keycloak (realm crash-game, client crash-game-client).
 *
 * Camada Service: encapsula a integração externa (IdP). As Pages/Components
 * nunca falam com o `oidc-client-ts` diretamente.
 */

const userManager = new UserManager({
  authority: env.keycloak.authority,
  client_id: env.keycloak.clientId,
  redirect_uri: env.keycloak.redirectUri,
  post_logout_redirect_uri: env.keycloak.postLogoutRedirectUri,
  response_type: 'code', // authorization code flow
  scope: 'openid profile',
  // oidc-client-ts usa PKCE com S256 por padrão neste flow.
  userStore: new WebStorageStateStore({ store: window.localStorage }),
  automaticSilentRenew: true,
  monitorSession: false,
});

export type AuthUser = {
  sub: string;
  username: string;
  accessToken: string;
  expiresAt: number | undefined;
};

function toAuthUser(user: User | null): AuthUser | null {
  if (!user || user.expired) return null;
  const profile = user.profile;
  return {
    sub: profile.sub,
    username:
      (profile.preferred_username as string | undefined) ??
      (profile.name as string | undefined) ??
      profile.sub,
    accessToken: user.access_token,
    expiresAt: user.expires_at,
  };
}

export const authService = {
  /** Inicia o redirect para o Keycloak (tela de login). */
  login(): Promise<void> {
    return userManager.signinRedirect();
  },

  /** Trata o retorno do Keycloak na rota /callback. */
  async handleCallback(): Promise<AuthUser | null> {
    const user = await userManager.signinRedirectCallback();
    return toAuthUser(user);
  },

  /** Encerra a sessão local e no IdP. */
  async logout(): Promise<void> {
    await userManager.signoutRedirect();
  },

  /** Usuário atual (do storage), ou null se ausente/expirado. */
  async getUser(): Promise<AuthUser | null> {
    const user = await userManager.getUser();
    return toAuthUser(user);
  },

  /** Access token atual para o header Authorization, ou null. */
  async getAccessToken(): Promise<string | null> {
    const user = await userManager.getUser();
    if (!user || user.expired) return null;
    return user.access_token;
  },

  /** Renova silenciosamente o token se possível. */
  async renew(): Promise<AuthUser | null> {
    try {
      const user = await userManager.signinSilent();
      return toAuthUser(user);
    } catch {
      return null;
    }
  },
};
