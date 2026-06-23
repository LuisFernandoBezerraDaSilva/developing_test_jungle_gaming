# CONTRACT.md — Fonte Única de Verdade

> Este documento é a especificação técnica vinculante do projeto Crash Game.
> Qualquer agente (Claude Code, GitHub Copilot) que gere código para `services/games`,
> `services/wallets` ou `frontend` DEVE seguir exatamente os schemas, nomes de eventos e
> regras descritas aqui. NÃO infira formatos alternativos. Se algo necessário não estiver
> coberto aqui, pare e sinalize a ambiguidade em vez de assumir um formato.
>
> Versão: 1.1
> Última atualização: ver histórico git deste arquivo.

---

## 0. Convenções Globais

- Todos os timestamps em ISO 8601 UTC (`2026-06-21T14:30:00.000Z`).
- Todos os valores monetários são **inteiros em centavos** (`balanceCents`, `amountCents`), tipo `BIGINT` no Postgres, serializados como **string** no JSON (não `number`) para evitar perda de precisão acima de `2^53`. Frontend converte string → `BigInt` ou usa lib decimal para exibir.
- Multiplicadores (`currentMultiplier`, `crashMultiplier`, `cashoutMultiplier`) têm **exatamente 2 casas decimais** e são serializados como **string** no JSON (`"2.35"`). Internamente são representados como **inteiro de centésimos** (`235`) para cálculo sem float. **Payout:** `payoutCents = floor(amountCents × multiplicadorCentésimos / 100)`, em aritmética inteira (BigInt). A fração de sub-centavo é truncada (floor), consistente com o `Math.floor` usado no cálculo do crash point (seção 4).
- IDs são UUID v4, sempre `string`.
- Todo endpoint autenticado espera header `Authorization: Bearer <JWT>` validado contra o Keycloak (realm `crash-game`).
- `playerId` é sempre o claim `sub` do JWT — nunca aceito como input do client.
- `username` exibido em apostas (`bets[]`, `bet:placed`, `bet:cashed_out`) é resolvido a partir do `playerId` consultando o Keycloak — **não** é persistido junto com a `Bet`. Recomenda-se cache local com TTL para evitar latência e acoplamento ao IdP a cada leitura.
- Erros seguem o formato:
```json
{
  "statusCode": 400,
  "error": "INSUFFICIENT_BALANCE",
  "message": "Saldo insuficiente para esta aposta"
}
```
- Códigos de erro padronizados (usar exatamente estas strings em `error`):
  - `INSUFFICIENT_BALANCE`
  - `BET_ALREADY_PLACED` (jogador já apostou nesta rodada)
  - `ROUND_NOT_IN_BETTING_PHASE`
  - `ROUND_NOT_RUNNING` (tentativa de cashout fora da fase RUNNING)
  - `NO_PENDING_BET` (cashout sem aposta ativa)
  - `BET_AMOUNT_OUT_OF_RANGE` (fora de 100–100000 centavos)
  - `WALLET_NOT_FOUND`
  - `ROUND_NOT_FOUND` (nenhuma rodada existe ainda — só em banco recém-criado, antes da primeira conexão)
  - `UNAUTHORIZED`

---

## 1. Wallet Service — REST

### `POST /wallets` (auth)
Cria carteira para o jogador autenticado. Idempotente: se já existe, retorna a existente com 200 em vez de criar duplicata.

Request body: `{}`

Response `201 Created` (ou `200 OK` se já existia):
```typescript
type WalletResponse = {
  id: string;
  playerId: string;
  balanceCents: string;   // ex: "10000" = R$100,00
  currency: "BRL";
  createdAt: string;
  updatedAt: string;
};
```

### `GET /wallets/me` (auth)
Response `200`: `WalletResponse`
Response `404`: erro `WALLET_NOT_FOUND`

> Crédito e débito **nunca** são expostos via REST. Só acontecem consumindo eventos RabbitMQ (seção 3).
>
> **Exceção de bootstrap:** o saldo inicial do usuário de teste (`player`) é semeado via migration/seed **idempotente** no `docker:up`, não via evento — é a única forma de crédito fora do broker, justificada por ser dado de bootstrap. A seed deve poder rodar sem duplicar caso o registro já exista (ex: `INSERT ... ON CONFLICT DO NOTHING` ou upsert), e o estado do Postgres é persistido entre execuções via volume Docker.

---

## 2. Game Service — REST

### `GET /games/rounds/current` (sem auth)
```typescript
type CurrentRoundResponse = {
  roundId: string;
  phase: "BETTING" | "RUNNING" | "CRASHED" | "SETTLED";
  phaseStartedAt: string;
  bettingWindowSeconds: number;       // ex: 10
  currentMultiplier: string;          // ex: "2.35", só relevante se phase === RUNNING
  serverHash: string;                 // hash da seed, publicado ANTES do crash (provably fair)
  bets: Array<{
    playerId: string;
    username: string;
    amountCents: string;
    status: "PENDING" | "CASHED_OUT" | "WON" | "LOST";
    cashoutMultiplier: string | null;
    payoutCents: string | null;
  }>;
};
```

> **Loop sob demanda (economia de recurso):** o ciclo de rodadas roda apenas enquanto há atividade. O loop é **bootstrapado on-demand** por dois gatilhos: a **conexão WebSocket** (o primeiro cliente abre uma nova `BETTING`) **ou** uma leitura REST deste endpoint (`GET /games/rounds/current`) quando ocioso. Assim, quem entra pelo WS **ou** pelo REST encontra sempre um jogo ativo. O bootstrap é **idempotente** (só inicia se não houver rodada/engine ativos) e — por ser um efeito de inicialização sob demanda, não uma ação de jogo — não fere a regra de que apostar/sacar são sempre via endpoints próprios. Uma rodada já iniciada **sempre roda até o fim** (`SETTLED`), mesmo que todos desconectem no meio — apostas e liquidação não são abortadas. Quando ocioso e ainda não houve bootstrap nesta requisição, este endpoint (e o `round:snapshot`) pode retornar a **última rodada `SETTLED`**. Em banco recém-criado, antes de qualquer rodada existir e antes do bootstrap, retorna `404` (`ROUND_NOT_FOUND`).

### `GET /games/rounds/history?page=1&limit=20` (sem auth)
```typescript
type RoundHistoryResponse = {
  rounds: Array<{
    roundId: string;
    crashMultiplier: string;     // ex: "4.21"
    crashedAt: string;
    totalBets: number;
    totalWagered: string;        // centavos
  }>;
  page: number;
  limit: number;
  total: number;
};
```

### `GET /games/rounds/:roundId/verify` (sem auth)
```typescript
type VerifyResponse = {
  roundId: string;
  serverSeed: string | null;   // REVELADO só após o crash (CRASHED/SETTLED); null enquanto BETTING/RUNNING
  serverHash: string;          // hash publicado ANTES da rodada (deve bater com serverHash do current)
  clientSeed: string;          // string pública fixa "crash-game-public-seed" (ver seção 4)
  nonce: number;               // número sequencial da rodada na hash chain
  crashMultiplier: string | null; // null enquanto a rodada não crashou
  // O verificador deve poder recalcular crashMultiplier a partir de
  // (serverSeed, clientSeed, nonce) usando o algoritmo da seção 4
  // e confirmar que bate, E confirmar que HASH(serverSeed) === serverHash.
};
```

> **Commit-reveal (provably fair):** enquanto a rodada está ativa (`BETTING`/`RUNNING`),
> o `serverSeed` **não** é exposto — apenas o `serverHash` (o commit). Revelar o seed
> antes do crash permitiria recalcular o `crashMultiplier` antecipadamente. O `serverSeed`
> e o `crashMultiplier` só são retornados quando a rodada está `CRASHED`/`SETTLED`. Isso é
> consistente com o README ("exibição do **hash** da seed **antes** da rodada"; verificação
> de "qualquer rodada **passada**").

### `GET /games/leaderboard?period=24h` (sem auth) — bônus
`period` ∈ `"24h" | "week"` (default `24h`). Top 10 jogadores por **lucro líquido**
(`Σ payoutCents − Σ amountCents`) sobre apostas liquidadas (`WON`/`LOST`) no período.
```typescript
type LeaderboardResponse = {
  period: "24h" | "week";
  entries: Array<{
    rank: number;
    playerId: string;
    username: string;
    profitCents: string;   // pode ser negativo (string), ex: "-10000"
    totalBets: number;
  }>;
};
```

### `GET /games/bets/me?page=1&limit=20` (auth)
```typescript
type MyBetsResponse = {
  bets: Array<{
    roundId: string;
    amountCents: string;
    status: "PENDING" | "CASHED_OUT" | "WON" | "LOST" | "REJECTED";
    cashoutMultiplier: string | null;
    payoutCents: string | null;
    createdAt: string;
  }>;
  page: number;
  limit: number;
  total: number;
};
```

### `POST /games/bet` (auth)
Request:
```typescript
type PlaceBetRequest = {
  amountCents: string;   // entre "100" (R$1,00) e "100000" (R$1.000,00)
};
```
Response `201`:
```typescript
type PlaceBetResponse = {
  betId: string;
  roundId: string;
  amountCents: string;
  status: "PENDING";
};
```
Validações síncronas (nesta ordem, falha rápido no primeiro erro):
1. `phase === "BETTING"` → senão `ROUND_NOT_IN_BETTING_PHASE`
2. `amountCents` dentro do range → senão `BET_AMOUNT_OUT_OF_RANGE`
3. jogador não tem aposta nesta rodada ainda → senão `BET_ALREADY_PLACED`

> **Saldo NÃO é validado sincronamente neste endpoint.** Passadas as validações 1–3, a aposta
> nasce `PENDING` e o endpoint retorna `201` imediatamente (UX rápida). O Game publica
> `bet.placed`; o Wallet (dono do saldo) processa o débito de forma **síncrona e determinística**.
> Se insuficiente → `wallet.debit.failed` (reason `INSUFFICIENT_BALANCE`) → Game marca a `Bet`
> como `REJECTED` e emite `bet:rejected` ao jogador. Ou seja: o cálculo do saldo é **síncrono no
> Wallet**; o retorno ao contexto de jogo é **assíncrono** via saga (seção 3). Por isso
> `INSUFFICIENT_BALANCE` não é resposta síncrona de `POST /games/bet`.

### `POST /games/bet/cashout` (auth)
Request: `{}` (usa roundId ativo + sub do JWT)
Response `200`:
```typescript
type CashoutResponse = {
  betId: string;
  cashoutMultiplier: string;
  payoutCents: string;
};
```
Validações:
1. `phase === "RUNNING"` → senão `ROUND_NOT_RUNNING`
2. jogador tem aposta `PENDING` nesta rodada → senão `NO_PENDING_BET`

---

## 3. Eventos RabbitMQ (Game ↔ Wallet)

**Exchange:** `crash-game.events` (topic exchange)
**Padrão de routing key:** `<contexto>.<evento>`

Todas as mensagens incluem envelope padrão:
```typescript
type EventEnvelope<T> = {
  eventId: string;        // UUID, usado para idempotência (ver abaixo)
  eventType: string;      // ex: "bet.placed"
  occurredAt: string;
  payload: T;
};
```

### Idempotência (obrigatório)
Todo consumer (Wallet Service consumindo eventos do Game, e vice-versa se houver) DEVE:
1. Antes de processar, tentar `SET NX` no Redis com chave `processed:<eventId>` e TTL de 24h.
2. Se a chave já existia → ACK a mensagem sem reprocessar (já foi feito).
3. Se não existia → processar, então confirmar.

### Entrega e retry (at-least-once)
Consumers usam **ack manual**. Em falha de processamento: `nack` com requeue para reprocessar; a idempotência (acima) evita efeito duplicado, resultando em **exactly-once efetivo**. Após N tentativas, a mensagem vai para uma **dead-letter queue** (`crash-game.events.dlq`) para inspeção manual. Garante que um crédito de ganho (`round.settled` → `WON`) nunca seja perdido silenciosamente.

### Routing key: `bet.placed`
Publicado pelo **Game Service** quando uma aposta é criada (status `PENDING`), ANTES de confirmar ao cliente.
```typescript
type BetPlacedPayload = {
  betId: string;
  roundId: string;
  playerId: string;
  amountCents: string;
};
```
**Wallet Service consome isso e tenta debitar.** Resposta via:

### Routing key: `wallet.debit.succeeded` | `wallet.debit.failed`
Publicado pelo **Wallet Service** em resposta a `bet.placed`.
```typescript
type DebitResultPayload = {
  betId: string;
  playerId: string;
  amountCents: string;
  reason?: string;   // presente apenas se failed, ex: "INSUFFICIENT_BALANCE"
};
```
**Game Service consome isso:**
- Se `succeeded` → aposta confirmada definitivamente (já estava visível, agora é "garantida").
- Se `failed` → **ação de compensação**: marcar a `Bet` como `REJECTED`, remover da lista de apostas ativas, emitir evento WS `bet:rejected` para o jogador específico (não broadcast).

> Esta é a saga: Game cria a aposta otimisticamente (UX rápida), Wallet confirma ou rejeita assincronamente, Game compensa se rejeitado. Documentar esse fluxo no README como decisão de arquitetura.

### Routing key: `round.settled`
Publicado pelo **Game Service** ao final de cada rodada, uma mensagem por aposta liquidada.
```typescript
type RoundSettledPayload = {
  betId: string;
  roundId: string;
  playerId: string;
  outcome: "WON" | "LOST";
  amountCents: string;        // valor original apostado
  payoutCents: string;        // "0" se LOST; se WON = floor(amountCents × cashoutMultiplierCentésimos / 100), ver §0
};
```
`WON` ⟺ o jogador deu cashout antes do crash; o `payoutCents` é exatamente o valor já devolvido no `CashoutResponse` (calculado com o `cashoutMultiplier` travado no cashout). `LOST` ⟺ aposta ainda `PENDING` no momento do crash → `payoutCents = "0"`.

**Wallet Service consome isso** e credita `payoutCents` se `outcome === "WON"` (já debitou o `amountCents` no `bet.placed`, então só credita o payout completo, não a diferença — mais simples e auditável).

---

## 4. Algoritmo Provably Fair

**Antes de cada rodada:**
1. Gerar `serverSeed` aleatório (32 bytes, hex).
2. Calcular `serverHash = SHA256(serverSeed)`.
3. Publicar `serverHash` no `GET /games/rounds/current` — **antes** da fase de apostas abrir. Isso prova que o resultado foi decidido antes das apostas.
4. `clientSeed`: **string pública fixa `"crash-game-public-seed"`** (decisão tomada — ver §6). Provably fair não é um padrão único; o requisito do desafio (verificação independente via HMAC + commit-reveal) é satisfeito com clientSeed fixo, pois ele é devolvido no `verify` e o verificador recomputa. Documentar a escolha no README.
5. `nonce`: número sequencial da rodada (incrementa a cada rodada, forma a hash chain).

**Cálculo do crash point:**
```typescript
function calculateCrashPoint(serverSeed: string, clientSeed: string, nonce: number): number {
  const hmac = HMAC_SHA256(key: serverSeed, message: `${clientSeed}:${nonce}`);
  // usar os primeiros 8 hex chars (32 bits) do hmac como inteiro
  const intValue = parseInt(hmac.substring(0, 8), 16);
  const maxValue = 0xFFFFFFFF;

  // house edge de 1% (ajustável) — fórmula padrão de crash games
  const houseEdge = 0.01;
  const e = 2 ** 32;
  const result = Math.floor((e / (e - intValue)) * (1 - houseEdge) * 100) / 100;

  // crash point mínimo é 1.00x
  return Math.max(1.00, result);
}
```

**Após o crash, revelar:**
- `serverSeed` (agora público)
- O verificador recalcula `SHA256(serverSeed)` e confirma que bate com o `serverHash` publicado antes.
- O verificador recalcula `calculateCrashPoint(serverSeed, clientSeed, nonce)` e confirma que bate com o `crashMultiplier` real da rodada.

> Implementar esse cálculo como função pura testável isoladamente (cobre o requisito de teste unitário "cálculo determinístico do crash point").

---

## 4.1 Curva do multiplicador (engine — server-side)

Crescimento **exponencial** do multiplicador no tempo.

```typescript
// t em segundos desde round:started; k ajustável (ex: 0.06)
function multiplierAt(t: number): number {
  return Math.floor(Math.exp(k * t) * 100) / 100; // 2 casas decimais, floor
}
```

- Tick emitido a cada ~100ms (`round:tick`) com o `multiplier` corrente (string `"x.xx"`).
- A rodada **crasha** no primeiro tick em que `multiplierAt(t) >= crashMultiplier`. O servidor emite `round:crashed` com o `crashMultiplier` real (determinado pela seção 4), não o valor arredondado do tick.
- O servidor é a **única fonte de verdade** do multiplicador; o cliente apenas renderiza os ticks (requisito eliminatório de sincronização).
- Uso de `Math.exp`/float aqui é aceitável: multiplicador **não é dinheiro**. O cálculo de payout permanece em aritmética inteira (seção 0).

---

## 5. WebSocket — Eventos Server → Client

### Conexão (como o frontend deve conectar)

| Parâmetro | Valor | Notas |
|---|---|---|
| **Origem pública** | `http://localhost:8000` | Via Kong API Gateway — mesma origem do REST, evita CORS |
| **Path do socket.io** | `/socket.io/` | Padrão socket.io. Kong roteia este path para o Game Service. |
| **Namespace socket.io** | `/game` | Camada socket.io, independente do path HTTP acima |
| **Transports** | `["websocket"]` | Kong suporta WebSocket upgrade nativamente |

**Snippet de conexão (frontend):**
```typescript
import { io } from "socket.io-client";

const socket = io("http://localhost:8000/game", {
  path: "/socket.io/",           // path HTTP que o Kong roteia
  transports: ["websocket"],
  auth: { token: accessToken },  // opcional; sem token = espectador anônimo
});
```

> **path vs namespace:** são conceitos distintos. `path` (`/socket.io/`) é o path HTTP usado no handshake — o Kong usa para rotear para o Game Service. `namespace` (`/game`) é o canal lógico dentro da conexão socket.io — o servidor usa para isolar contextos. O frontend passa os dois separadamente: `io("http://localhost:8000/game", { path: "/socket.io/" })`.

> **Roteamento Kong:** a rota `games-ws-route` em `kong.yml` expõe `/socket.io` → `http://games:4001` com `strip_path: false`, preservando o path completo que o servidor socket.io espera.

**Auth:** opcional na conexão. O cliente pode enviar o JWT no `auth` do handshake socket.io; um middleware valida e faz `join` na room privada `player:<sub>` (necessária para receber `bet:rejected`). Sem token, o socket recebe apenas os eventos broadcast (espectador anônimo). Ações do jogador continuam sempre via REST.

Ao conectar, o servidor emite imediatamente `round:snapshot` (apenas para o socket que conectou) com o estado atual completo, para hidratar quem entra no meio de uma rodada.

Todos os eventos seguem `{ type: string, payload: T, timestamp: string }`.

| Evento | Quando | Payload |
|---|---|---|
| `round:snapshot` | Logo após o connect (unicast ao socket que conectou) | Mesmo shape de `CurrentRoundResponse` (seção 2): `{ roundId, phase, phaseStartedAt, bettingWindowSeconds, currentMultiplier, serverHash, bets[] }` |
| `round:betting_started` | Nova fase de apostas abre | `{ roundId, bettingWindowSeconds, serverHash }` |
| `round:started` | Fase de apostas fecha, multiplicador começa a subir | `{ roundId, startedAt }` |
| `round:tick` | A cada ~100ms durante RUNNING | `{ roundId, multiplier: string }` |
| `round:crashed` | Multiplicador para | `{ roundId, crashMultiplier, serverSeed, serverHash, clientSeed, nonce }` |
| `bet:placed` | Qualquer jogador aposta (broadcast) | `{ roundId, playerId, username, amountCents }` |
| `bet:cashed_out` | Qualquer jogador saca (broadcast) | `{ roundId, playerId, username, cashoutMultiplier, payoutCents }` |
| `bet:rejected` | Específico ao jogador (room privada `player:<playerId>`), quando débito falha | `{ betId, reason }` |

> Frontend deve usar `round:tick` para animar a curva — não recalcular o multiplicador localmente de forma independente, para evitar dessincronia entre abas (requisito eliminatório de sincronização).

---

## 6. Decisões já tomadas (não reabrir sem atualizar este doc)

- Mensageria: **RabbitMQ** (não SQS/LocalStack) — mais simples para rodar localmente via Docker Compose.
- ORM: **Prisma** nos dois serviços (mesmo ORM por consistência).
- Saga: **coreografia via eventos** (não orquestrador central) — mais simples para o escopo de 2 serviços.
- Frontend framework: a definir (Vite+React é o caminho mais rápido dado o prazo apertado).
- House edge fixo em 1% no cálculo do crash point.
- `clientSeed`: **string pública fixa `"crash-game-public-seed"`** (provably fair não tem padrão único; verificação independente é satisfeita assim).
- Nomenclatura: hash da server seed é **`serverHash`** em todo o contrato (REST e WS).
- Loop de rodadas **sob demanda**, bootstrapado por **conexão WS ou leitura REST** de `GET /rounds/current` (idempotente) — quem entra por qualquer um dos dois encontra um jogo ativo. Rodada iniciada sempre completa até `SETTLED`; ocioso (antes de bootstrap) → `current`/`round:snapshot` devolvem a última `SETTLED`; sem nenhuma rodada e antes de bootstrap → `404 ROUND_NOT_FOUND`. (Revisado: o gatilho REST foi liberado — o README não o proíbe; antes o contrato restringia a WS.)
- **Provably fair — commit-reveal:** `/verify` revela `serverSeed` e `crashMultiplier` **apenas** em rodadas `CRASHED`/`SETTLED`; em rodada ativa retorna `serverSeed: null` / `crashMultiplier: null` (só o commit `serverHash` é público antes do crash).
- Idempotência: **Redis** (`SET NX` por `eventId`), adicionado ao `docker-compose` como serviço de infra.
- Saldo inicial do usuário de teste: **seed/migration idempotente** (exceção à regra de crédito-só-via-evento), Postgres persistido por volume Docker.
- Multiplicador representado internamente como inteiro de centésimos; payout por aritmética inteira com truncamento (floor).
- Saldo insuficiente: cálculo **síncrono no Wallet**, retorno **assíncrono** ao jogo via saga (`bet:rejected`). `INSUFFICIENT_BALANCE` não é resposta síncrona de `POST /games/bet`.
- **WebSocket via Kong** (§5): path `/socket.io/` exposto em `http://localhost:8000` com `strip_path: false` → Game Service. Frontend usa `io("http://localhost:8000/game", { path: "/socket.io/" })`. Path HTTP e namespace socket.io são conceitos distintos — ambos são necessários.
