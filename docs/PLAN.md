# PLAN.md — Plano de Execução (2 dias · ~36h nominais)

> Jornada: **18h/dia × 2**. Mas 18h não rendem 18h — fadiga multiplica bugs em debugging
> de sistema distribuído (saga, WS, Keycloak). Conte com **~13–15h efetivas/dia (~26–30h reais)**.
> Os bônus cabem nesse colchão **real**, e só depois que o eliminatório da área estiver travado.
>
> Stack travada no `docs/CONTRACT.md` (v1.1). Duas trilhas em paralelo: **BE = Claude Code**,
> **FE = Copilot**. O front começa no Dia 1 contra o contrato (com mock) e integra no fim.

---

## Regra de ouro — os 7 eliminatórios (pass/fail)

Faltou qualquer um = desclassificado. Prioridade absoluta. **Nunca** troque um eliminatório por bônus.

- [ ] **E1** — `bun run docker:up` sobe tudo sem passo manual
- [ ] **E2** — Gameplay completo (apostar → multiplicador → cashout/crash → liquidação)
- [ ] **E3** — Dois serviços separados comunicando via RabbitMQ
- [ ] **E4** — Sync em tempo real (múltiplas abas mostram o mesmo estado)
- [ ] **E5** — Precisão monetária (sem float; saldo nunca negativo)
- [ ] **E6** — Auth via Keycloak (backend valida JWT)
- [ ] **E7** — Testes existem (unit + E2E)

---

## Bônus alvo (4) — só após eliminatório travado

- [ ] **⭐ Rate limiting via Kong** (~1h) — config no Kong
- [ ] **⭐ Fórmula da curva na UI** (~0,5h) — transparência provably fair
- [ ] **⭐ Seed determinística p/ E2E** (~2–3h) — cenários reprodutíveis (ex: crash em 1.5x)
- [ ] **⭐ Outbox transacional** (~4–6h) — publicação confiável (at-least-once); inbox/idempotência continua no **Redis** (decisão soberana)

## Cortes (fora de escopo, sem exceção)

- Observabilidade (OTel/Prometheus/Grafana), Leaderboard, Playwright, Storybook, Autobet (Martingale/stop-loss).
- E2E: só os 3 cenários obrigatórios. Unit: só os 4 domínios exigidos.
- Front: só Login + 1 página de jogo. Animação simples.

---

## DIA 1 — Infra + Wallet (BE) · Scaffold + Login (FE)

### Bloco 1 — Infra (~3h) · BE  ⚠️ FRONT-LOAD (risco nº1)
- [ ] `docker-compose` sobe: Postgres, RabbitMQ, **Redis**, Keycloak, Kong, games, wallets
- [ ] Realm `crash-game` importado automaticamente (`player`/`player123`)
- [ ] Rotas Kong: `/games/*` → games, `/wallets/*` → wallets
- [ ] Prisma nos dois serviços + migrations no `docker:up`
- [ ] **Seed idempotente**: carteira do `player` com saldo (`ON CONFLICT DO NOTHING`)
- [ ] Guard de validação de JWT (Keycloak) nos endpoints `auth`
- [ ] ✅ **Checkpoint E1 + E6:** request autenticado via Kong chega a um serviço e o JWT é validado
- [ ] **⭐ Rate limiting via Kong** (após rotas verdes)

### Bloco 2 — Wallet Service (~5h) · BE
- [ ] Domínio: `Wallet` (centavos `BIGINT`, **saldo nunca negativo**, BigInt/Decimal)
- [ ] Prisma repo + `POST /wallets` (idempotente) + `GET /wallets/me`
- [ ] Consumer `bet.placed` → debita → publica `wallet.debit.succeeded`/`failed`
- [ ] Consumer `round.settled` → credita `payoutCents` se `WON`
- [ ] Idempotência (inbox): `SET NX` no Redis por `eventId` + ack manual + requeue + DLQ
- [ ] Unit tests: crédito, débito, saldo insuficiente, precisão monetária
- [ ] ✅ **Checkpoint E5:** débito que iria abaixo de 0 falha; nenhum float em dinheiro
- [ ] **⭐ Outbox (lado Wallet):** tabela `outbox` + relay; publica `wallet.debit.*` via outbox na mesma transação do débito

### Bloco 3 — Buffer / antecipa Game core (~4–6h) · BE
- [ ] Se Wallet fechou cedo, começar `Round`/provably fair já no Dia 1 (ver Dia 2 Bloco 4)

### Bloco FE-1 — Scaffold + Login (paralelo, Copilot)
- [ ] Vite + React + TS strict + Tailwind v4 + shadcn/ui, **dark/casino theme**
- [ ] Login Keycloak (OIDC code + **PKCE S256**), callback, storage de token
- [ ] Layout shell + rotas (login, jogo)
- [ ] Stores (TanStack Query + Zustand), tipos **do contrato**
- [ ] Componentes contra o contrato com **mock**: controles de aposta, multiplicador, lista de apostas, histórico, saldo, countdown
- [ ] Esqueleto do WS client

---

## DIA 2 — Game + Saga (BE) · Integração + Testes + Bônus (ambos)

### Bloco 4 — Game core (~4h) · BE
- [ ] `Round` (agregado): state machine `BETTING → RUNNING → CRASHED → SETTLED`
- [ ] `Bet` (`PENDING → CASHED_OUT/WON/LOST/REJECTED`)
- [ ] **Provably fair**: `calculateCrashPoint` (fn pura) + `serverSeed`/`serverHash`/`nonce` + unit test determinístico
- [ ] Engine: exponencial `e^(k·t)`; crash quando `>= crashMultiplier`; loop **sob demanda**
- [ ] Unit tests: ciclo de vida do Round, lógica de Bet

### Bloco 5 — Game REST + WS + Saga (~3h) · BE
- [ ] REST: `POST /bet`, `/bet/cashout`, `GET rounds/current|history|:id/verify`, `GET bets/me`
- [ ] WS: token no handshake → room `player:<sub>`; `round:snapshot` no connect; `betting_started`/`started`/`tick`/`crashed`/`bet:placed`/`bet:cashed_out`/`bet:rejected`
- [ ] Saga: publica `bet.placed`; consome `wallet.debit.*` → compensação `REJECTED` + `bet:rejected`; emite `round.settled`
- [ ] ✅ **Checkpoint E3:** aposta dispara fluxo Game→Wallet→Game pelo RabbitMQ
- [ ] **⭐ Outbox (lado Game):** publica `bet.placed` e `round.settled` via outbox na transação do estado

### Bloco 6 — Integração + Testes + Bônus (~5–7h) · BE + FE
- [ ] FE liga no REST + WS reais; gráfico animado **simples** + payout potencial + countdown
- [ ] ✅ **Checkpoint E2:** apostar → multiplicador → cashout/crash → saldo atualizado
- [ ] ✅ **Checkpoint E4:** 2 abas → mesmo estado (front-load no Dia 1 se sobrar tempo)
- [ ] **⭐ Seed determinística p/ E2E:** script que força crash/seed conhecidos
- [ ] **E2E (3 cenários):** cashout→saldo; crash→perda; erros (saldo insuf., aposta dupla, aposta em rodada ativa)
- [ ] ✅ **Checkpoint E7:** unit + E2E existem e passam
- [ ] **⭐ Fórmula da curva na UI** (transparência)
- [ ] **README**: setup, decisões (saga, outbox+Redis, provably fair), trade-offs
- [ ] Histórico git limpo (commits atômicos)

---

## Verificação final (antes de entregar)

- [ ] `docker:prune` → `docker:up` do zero, **sem passo manual** → jogo funciona
- [ ] `player`/`player123` loga e tem saldo
- [ ] 2 abas sincronizadas
- [ ] Provably fair: `SHA256(serverSeed) === serverHash` e crash recalculável
- [ ] Todos os 7 eliminatórios + 4 bônus marcados

---

## Disciplina de tempo

- **Timebox rígido por bloco.** Estourou → corta polish, **nunca** eliminatório.
- **Ordem de sacrifício se atrasar:** bônus → polish do front → escopo de testes. Infra/saga/sync são intocáveis.
- Commit atômico ao fim de cada item (git vale 10%, de graça se feito durante).
- 18h/dia é brutal: **durma o suficiente entre os dois dias** — um dev exausto no Dia 2 quebra a integração, que é a parte mais frágil.
- Stretch (só se sobrar de verdade): **Auto cashout** e **CI (só unit)**.
