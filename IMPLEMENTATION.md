# Implementação — Crash Game

## Setup

```bash
bun run docker:up
# Acesso: http://localhost:8000 (Kong API Gateway)
# Keycloak: http://localhost:8080 — login: admin/admin
# RabbitMQ Management: http://localhost:15672 — login: admin/admin
```

Usuário de teste: **player / player123** (saldo inicial: R$1.000,00)

## Arquitetura

### Serviços
- **`services/games`** — Engine do jogo, ciclo de rodadas, WebSocket, REST
- **`services/wallets`** — Carteira do jogador, débito/crédito via eventos

### Infraestrutura
| Serviço | Porta | Função |
|---|---|---|
| Kong | 8000 | API Gateway (rate limiting, roteamento) |
| Keycloak | 8080 | Identity Provider (JWT) |
| RabbitMQ | 5672/15672 | Mensageria de eventos |
| Redis | 6379 | Idempotência de eventos (inbox) |
| Postgres | 5432 | Persistência (dbs: `games`, `wallets`) |

### Rotas via Kong
- `GET /games/rounds/current` → Games Service (sem auth)
- `GET /games/rounds/history` → Games Service (sem auth)
- `GET /games/rounds/:id/verify` → Games Service (sem auth)
- `GET /games/bets/me` → Games Service (auth)
- `POST /games/bet` → Games Service (auth)
- `POST /games/bet/cashout` → Games Service (auth)
- `POST /wallets` → Wallets Service (auth)
- `GET /wallets/me` → Wallets Service (auth)
- WebSocket `/socket.io` → Games Service (namespace `/game`)

## Decisões de Arquitetura

### Saga via coreografia (não orquestrador)
O fluxo de aposta é uma saga assíncrona com 2 serviços:

```
Client → POST /games/bet → Game (cria Bet PENDING, publica bet.placed)
                              ↓
                         Wallet (debita, publica wallet.debit.succeeded/failed)
                              ↓
                         Game (confirmed ou compensa: Bet REJECTED + WS bet:rejected)
```

**Por que coreografia?** Com 2 serviços e fluxo simples, um orquestrador central adicionaria complexidade sem benefício. Cada serviço conhece apenas seus próprios eventos. **Trade-off:** menos visibilidade central do estado da saga — aceitável neste escopo.

**Por que o saldo não é validado sincronamente no `POST /games/bet`?** A aposta nasce `PENDING` e o `201` retorna na hora (UX rápida). O cálculo de saldo é **síncrono no Wallet** (dono do saldo); o retorno ao jogo é **assíncrono** via saga. Por isso `INSUFFICIENT_BALANCE` chega como `bet:rejected` (WebSocket), não como erro síncrono do endpoint.

### Idempotência com Redis (inbox pattern)
Todo consumer faz `SET NX processed:<eventId> EX 86400` antes de processar. Se a chave já existe, ACK sem reprocessar → exactly-once efetivo mesmo com at-least-once delivery. A DLQ (`crash-game.events.dlq`) captura mensagens após MAX_RETRIES falhas consecutivas.

### Provably Fair
- Antes de cada rodada: `serverSeed` gerado aleatoriamente (32 bytes hex)
- `serverHash = SHA256(serverSeed)` publicado antes da fase de apostas
- Crash calculado com `HMAC-SHA256(serverSeed, "crash-game-public-seed:nonce")`
- `serverSeed` revelado após o crash → qualquer um pode verificar
- `clientSeed` fixo (`"crash-game-public-seed"`) — documentado e devolvido no `/verify`

### Precisão monetária
- Saldo e valores em `BIGINT` (centavos) no Postgres — nunca float
- Serialização JSON: `string` (evita perda acima de `2^53`)
- Payout: `floor(amountCents × multiplierCentesimos / 100)` em aritmética BigInt

### Loop sob demanda
O ciclo de rodadas só corre com ≥1 cliente WebSocket conectado. Quando todos desconectam ao final de uma rodada, a engine para. A primeira conexão dispara um novo ciclo. Uma rodada iniciada sempre completa até `SETTLED`.

### Seed do usuário de teste
O `playerId` do usuário `player` é fixado no `realm-export.json` do Keycloak como `00000000-0000-0000-0000-000000000001`. A migration `20260622000001_seed_player` insere a wallet com R$1.000,00 usando `ON CONFLICT DO NOTHING` (idempotente).

### `POST /wallets` idempotente
Retorna `201` na criação e `200` se a carteira já existia — sem duplicar registro, conforme o contrato.

### Builds Docker reproduzíveis
Os `bun.lock` de cada serviço são versionados e os Dockerfiles usam `bun install --frozen-lockfile`, garantindo resolução idêntica de dependências em qualquer build.

## Testes

```bash
# Wallet Service
cd services/wallets && bun test

# Game Service
cd services/games && bun test
```

Cobertos: crédito/débito/saldo insuficiente, ciclo de vida do Round, lógica de Bet, cálculo determinístico do crash point, payout com aritmética inteira.

**Resultado verificado:** Wallets **8/8** · Games **22/22** · `tsc --noEmit` sem erros nos dois serviços.

## Decisões de Arquitetura — Frontend

> Trilha de frontend (Copilot). App em `frontend/` — Vite + React 19 + TypeScript
> strict + Tailwind v4. O contrato (`docs/CONTRACT.md`) é a fonte única de verdade
> de schemas REST, eventos WS e códigos de erro.

### Organização em camadas (MVC adaptado)
Separação explícita de responsabilidades, espelhando o DDD do backend:
- **Page** (`pages/`) — composição da rota e orquestração de estado da tela
  (ex.: `GamePage` monta os hooks `useGameSocket`/`useAutoPlay`/`useSoundEffects`
  e os componentes). Não fala com APIs diretamente.
- **Component** (`components/`) — apresentação reutilizável. `components/ui/*` são
  primitivos (Button/Card/Input/Skeleton); `components/game/*` são as telas do jogo.
- **Service** (`services/`) — toda integração externa: `http.ts` (REST via Kong),
  `ws.service.ts` (socket.io), `auth.service.ts` (OIDC), `game/wallet.service.ts`,
  `sound.service.ts`. Nenhum componente importa `fetch`/`oidc-client-ts` direto.

### Server state vs. client state
- **TanStack Query** para *server state* (saldo, histórico, apostas): cache,
  revalidação e invalidação por `queryKey`. Eventos WS de liquidação invalidam
  `['wallet']` e `['rounds','history']` em vez de mutar cache manualmente.
- **Zustand** para *client state* de tempo real e preferências:
  - `round.store` — estado da rodada dirigido **exclusivamente** pelos eventos WS.
  - `auth.store` — sessão/usuário derivados do OIDC.
  - `settings.store` — preferências (som, auto-cashout, auto-bet) com `persist` no
    `localStorage`.

### Multiplicador: servidor é a única fonte de verdade (E4)
O multiplicador exibido vem **somente** do evento `round:tick`; nunca é
recalculado localmente. A curva do `CrashChart` é apenas uma representação visual
derivada do valor corrente. Assim, múltiplas abas mostram exatamente o mesmo
estado — requisito eliminatório de sincronização.

### Precisão monetária (BigInt, sem float)
Valores chegam como `string` de centavos e **nunca** são convertidos para `number`
em cálculo. `lib/money.ts` centraliza tudo em `BigInt`:
`formatCents`, `multiplierToCentesimos`, `computePayoutCents` (`floor(amount ×
centésimos / 100)`) e `reaisToCents`. O JSON é parseado com `JSON.parse` padrão
(mantém strings como strings) — sem coerção numérica no `http.ts`.

### Autenticação (OIDC code + PKCE S256)
`oidc-client-ts` com `response_type=code` (PKCE S256 por padrão) contra o realm
`crash-game` / client `crash-game-client`. Rotas protegidas via `ProtectedRoute`;
o `http.ts` injeta `Authorization: Bearer` apenas em chamadas marcadas `auth`,
buscando o token sempre do `UserManager` (com silent renew). A configuração do
Keycloak em si é responsabilidade da trilha de backend/infra.

### WebSocket e a room privada
`ws.service` conecta no namespace `/game` com o JWT no `auth` do handshake, o que
faz o servidor associar o socket à room `player:<sub>` — necessária para o evento
privado `bet:rejected`. Sem token, recebem-se só broadcasts. O hook
`useGameSocket` registra os listeners (§5), despacha para o `round.store` e
concentra os efeitos de UX (toasts, invalidação de queries), reconectando quando o
token muda.

### Liquidação otimista e compensação na UI
Como o saldo só é validado de forma assíncrona pela saga (§ backend), a UI é
otimista e compensa:
- `bet:rejected` → remove a aposta otimista do próprio jogador do `round.store` e
  exibe toast (mensagem dedicada para `INSUFFICIENT_BALANCE`).
- `round:crashed` → liquida a lista visível: apostas `PENDING` viram `LOST`
  (payout `'0'`) e `CASHED_OUT` viram `WON`, refletindo o resultado sem esperar
  refetch.

### Tratamento de erro padronizado
`HttpError` mapeia o envelope de erro do contrato (`statusCode`/`error`/`message`).
As mutations de aposta/cashout transformam isso em toasts (`sonner`), com fallback
amigável quando o backend não retorna o envelope esperado.

### Provably fair no cliente (bônus)
`lib/provablyFair.ts` reimplementa o algoritmo do §4 de forma **independente** via
Web Crypto API (SHA-256 + HMAC-SHA256), permitindo ao jogador confirmar, sem
confiar no servidor: `SHA256(serverSeed) === serverHash` e o crash point recalculado
== `crashMultiplier`. O `serverHash` é exibido **antes** da rodada e o `serverSeed`
após o crash; o `ProvablyFairDialog` consome `GET /games/rounds/:id/verify`.

### Automação de jogo (bônus)
- **Auto Cash Out** — saca quando o multiplicador **do servidor** atinge o alvo;
  apenas *lê* o tick e dispara o REST, nunca recalcula estado.
- **Auto Bet** — estratégias `fixed`/`martingale` com stop-lucro/stop-perda, toda a
  matemática em `BigInt` centavos (`lib/autobet.ts`, puro e testável). O hook
  `useAutoPlay` orquestra com guards por `roundId` (uma ação por rodada).
- **Efeitos sonoros** — `sound.service` sintetiza tons via Web Audio API (sem
  assets binários); `useSoundEffects` reage às transições de rodada/aposta,
  respeitando a preferência `soundEnabled`. AudioContext só é tocado em hooks/
  componentes (nunca importado em testes, pois não existe em jsdom).

### UI/UX
Dark mode com estética cassino (acentos neon), responsivo (grid desktop + coluna
única no mobile), animações de subida/crash, loading states com `Skeleton` e erros
via toast. Componentes `ui/*` próprios (estilo shadcn) em vez de uma lib pesada,
mantendo o bundle enxuto.

### Configuração de ambiente
`config/env.ts` concentra as variáveis `VITE_*` com defaults para a infra local
(Kong `:8000`, Keycloak `:8080`). `VITE_WS_URL` é separável da URL REST para
permitir apontar o socket.io diretamente ao Game Service caso o roteamento WS do
Kong não esteja disponível.

### Testes (frontend)
Vitest + jsdom + Testing Library. Cobrem a lógica pura crítica: aritmética
monetária (`money`), estratégias de auto-bet (`autobet`), verificação provably
fair (`provablyFair`, com vetores conhecidos SHA-256/HMAC) e o `settings.store`.

```bash
cd frontend && npm run test      # vitest run
cd frontend && npm run lint      # eslint
cd frontend && npm run build     # tsc -b && vite build
```

**Resultado verificado:** Frontend **22/22** testes · ESLint sem erros · build
de produção sem erros de tipo (`tsc -b`).

