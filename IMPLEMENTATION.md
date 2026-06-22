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

> _A preencher pelo Copilot (trilha de frontend)._

