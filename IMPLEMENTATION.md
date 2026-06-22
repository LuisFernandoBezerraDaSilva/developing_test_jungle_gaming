# Implementação — Crash Game

> Documentação de entrega: setup, decisões de arquitetura e trade-offs.
> A especificação técnica vinculante (schemas REST, eventos, WebSocket, provably fair)
> está em [`docs/CONTRACT.md`](docs/CONTRACT.md).

---

## Setup

Pré-requisitos: **Docker + Docker Compose** e **Bun ≥ 1.x** (apenas para os scripts `docker:*`).

```bash
bun run docker:up      # sobe toda a stack (infra + serviços), sem passo manual
bun run docker:down    # para os containers
bun run docker:prune   # remove containers, volumes e imagens
```

| Acesso | URL | Credenciais |
|---|---|---|
| API Gateway (Kong) | http://localhost:8000 | — |
| Keycloak Admin | http://localhost:8080 | `admin` / `admin` |
| RabbitMQ Management | http://localhost:15672 | `admin` / `admin` |

Usuário de teste: **`player` / `player123`** — saldo inicial **R$ 1.000,00** (semeado de forma idempotente).

---

## Arquitetura

### Serviços de aplicação
- **`services/games`** — Engine do jogo: ciclo de rodadas, provably fair, REST, WebSocket. Bounded context dono de `Round` e `Bet`.
- **`services/wallets`** — Carteira do jogador: saldo, crédito/débito via eventos. Bounded context dono de `Wallet`.

Ambos em **NestJS + TypeScript strict**, runtime **Bun**, ORM **Prisma**, com camadas DDD: `domain/` → `application/` → `infrastructure/` → `presentation/`.

### Infraestrutura (Docker Compose)
| Serviço | Porta | Função |
|---|---|---|
| Kong | 8000 | API Gateway (roteamento + rate limiting) |
| Keycloak | 8080 | Identity Provider (OIDC / JWT) |
| RabbitMQ | 5672 / 15672 | Mensageria de eventos (topic exchange) |
| Redis | 6379 | Idempotência de eventos (inbox pattern) |
| Postgres | 5432 | Persistência (databases: `games`, `wallets`) |

### Roteamento via Kong (`docker/kong/kong.yml`)
| Rota | Destino | Auth |
|---|---|---|
| `GET /games/rounds/current` | Games | não |
| `GET /games/rounds/history` | Games | não |
| `GET /games/rounds/:id/verify` | Games | não |
| `GET /games/bets/me` | Games | sim |
| `POST /games/bet` | Games | sim |
| `POST /games/bet/cashout` | Games | sim |
| `POST /wallets` | Wallets | sim |
| `GET /wallets/me` | Wallets | sim |
| WebSocket `/socket.io/` (namespace `/game`) | Games | opcional |

> **WebSocket via Kong:** a rota `games-ws-route` expõe `/socket.io` com `strip_path: false`,
> preservando o path que o servidor socket.io espera. Frontend conecta com
> `io("http://localhost:8000/game", { path: "/socket.io/" })`.

---

## Decisões de Arquitetura

### Saga via coreografia (sem orquestrador central)
O fluxo de aposta é uma saga assíncrona entre os dois serviços:

```
Client → POST /games/bet → Game (cria Bet PENDING, publica bet.placed) → 201 imediato
                              ↓
                         Wallet (debita de forma síncrona/determinística,
                                 publica wallet.debit.succeeded | failed)
                              ↓
                         Game: succeeded → aposta confirmada
                               failed    → compensação: Bet REJECTED + WS bet:rejected
```

**Por que coreografia?** Com apenas 2 serviços e um fluxo simples, um orquestrador
central adicionaria complexidade sem benefício. Cada serviço conhece apenas seus próprios
eventos. **Trade-off:** menos visibilidade central do estado da saga, aceitável neste escopo.

**Por que o saldo não é validado sincronamente no `POST /games/bet`?** A aposta nasce
`PENDING` e o `201` retorna na hora (UX rápida). O cálculo de saldo é **síncrono no Wallet**
(dono do saldo); o retorno ao contexto de jogo é **assíncrono** via saga. Por isso
`INSUFFICIENT_BALANCE` chega como `bet:rejected` (WebSocket), não como erro síncrono.

### Idempotência com Redis (inbox pattern)
Todo consumer faz `SET NX processed:<eventId> EX 86400` antes de processar. Se a chave já
existe → `ACK` sem reprocessar. Resultado: **exactly-once efetivo** mesmo com entrega
**at-least-once**. Consumers usam **ack manual + requeue** em falha; após `MAX_RETRIES`
a mensagem vai para a **dead-letter queue** (`crash-game.events.dlq`), garantindo que um
crédito de ganho nunca seja perdido silenciosamente.

### Provably Fair
- Antes de cada rodada: `serverSeed` aleatório (32 bytes hex) e `serverHash = SHA256(serverSeed)`.
- O `serverHash` é publicado **antes** da fase de apostas (commit) → prova que o resultado
  foi decidido antes das apostas.
- Crash point: `HMAC-SHA256(key=serverSeed, msg="crash-game-public-seed:nonce")`, com house
  edge de 1%. Implementado como **função pura testável** (`provably-fair.ts`).
- Após o crash, `serverSeed` é revelado. O endpoint `/verify` devolve `serverSeed`,
  `serverHash`, `clientSeed` e `nonce` → qualquer um recomputa e confirma.
- `clientSeed` é a string pública fixa `"crash-game-public-seed"`.

### Precisão monetária (eliminatório)
- Saldo e valores em **`BIGINT` (centavos)** no Postgres — **nunca float**.
- Serializados como **`string`** no JSON (evita perda de precisão acima de `2^53`).
- Multiplicador representado internamente como inteiro de centésimos (`2.35 → 235`).
- Payout: `floor(amountCents × multiplierCentesimos / 100)` em aritmética **BigInt** (trunca sub-centavo).
- Invariante de domínio: **saldo nunca fica negativo** — débito que ultrapassaria 0 lança `InsufficientBalanceError`.

### Loop de rodadas sob demanda
O ciclo só corre com **≥ 1 cliente WebSocket** conectado (economia de recurso). A primeira
conexão dispara uma nova fase `BETTING`. Uma rodada já iniciada **sempre completa até
`SETTLED`**, mesmo que todos desconectem no meio. Ocioso → `current`/`round:snapshot`
devolvem a última rodada `SETTLED`; banco recém-criado sem rodadas → `404 ROUND_NOT_FOUND`.

### `POST /wallets` idempotente
Retorna `201` na criação e `200` se a carteira já existia — sem duplicar registro.

### Seed do usuário de teste
O `playerId` de `player` é fixado no `realm-export.json` do Keycloak como
`00000000-0000-0000-0000-000000000001`. A migration `20260622000001_seed_player` insere a
wallet com R$ 1.000,00 via `ON CONFLICT DO NOTHING` (idempotente). É a **única** exceção à
regra "crédito só via evento", justificada por ser dado de bootstrap; o Postgres é
persistido por volume Docker.

### Builds Docker reproduzíveis
Os `bun.lock` de cada serviço são versionados e os Dockerfiles usam
`bun install --frozen-lockfile`, garantindo que a imagem resolva exatamente as mesmas
dependências em qualquer build.

---

## Testes

```bash
cd services/wallets && bun test tests/unit
cd services/games   && bun test tests/unit
```

**Resultado verificado:** Wallets **8/8** · Games **22/22** · `tsc --noEmit` sem erros nos dois serviços.

Cobertura unitária (camada de domínio):
- **Wallet** — crédito, débito, saldo insuficiente, saldo nunca negativo, precisão (serialização string).
- **Round** — máquina de estados `BETTING → RUNNING → CRASHED → SETTLED`, violação de invariantes.
- **Bet** — ciclo `PENDING → CASHED_OUT/WON/LOST/REJECTED`, liquidação.
- **Provably fair** — determinismo do crash point, verificação da hash chain, payout em aritmética inteira.

---

## Estrutura

```
services/
├── games/    domain · application · infrastructure · presentation · tests · prisma
└── wallets/  domain · application · infrastructure · presentation · tests · prisma
frontend/     (Vite + React — desenvolvido em paralelo)
docker/       kong/ · keycloak/ · postgres/
docker-compose.yml
docs/         CONTRACT.md · PLAN.md
```
