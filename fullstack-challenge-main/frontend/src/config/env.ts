/**
 * Configuração de ambiente. Valores default apontam para a infra local do
 * docker-compose (Kong em :8000, Keycloak em :8080).
 *
 * AMBIGUIDADE conhecida (sinalizada): o Kong só roteia `/games` e `/wallets`.
 * O WebSocket (socket.io, namespace `/game`) ainda não tem rota Kong definida
 * no contrato — por isso `VITE_WS_URL` é configurável de forma independente da
 * URL REST, permitindo apontar direto para o Game Service (:4001) se preciso.
 */

function required(value: string | undefined, fallback: string): string {
  if (value && value.length > 0) return value;
  return fallback;
}

export const env = {
  /** Base REST via Kong (rotas com prefixo /games e /wallets, strip_path=true). */
  apiBaseUrl: required(import.meta.env.VITE_API_BASE_URL, 'http://localhost:8000'),

  /** Origem do socket.io. Namespace `/game` é anexado pelo ws.service. */
  wsUrl: required(import.meta.env.VITE_WS_URL, 'http://localhost:8000'),

  keycloak: {
    authority: required(
      import.meta.env.VITE_KEYCLOAK_AUTHORITY,
      'http://localhost:8080/realms/crash-game',
    ),
    clientId: required(import.meta.env.VITE_KEYCLOAK_CLIENT_ID, 'crash-game-client'),
    redirectUri: required(
      import.meta.env.VITE_KEYCLOAK_REDIRECT_URI,
      `${window.location.origin}/callback`,
    ),
    postLogoutRedirectUri: required(
      import.meta.env.VITE_KEYCLOAK_POST_LOGOUT_URI,
      window.location.origin,
    ),
  },
} as const;
