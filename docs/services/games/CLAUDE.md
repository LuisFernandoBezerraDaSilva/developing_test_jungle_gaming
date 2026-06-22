# CLAUDE.md — Game Service

> Regras compartilhadas dos backends estão no CLAUDE.md da raiz. Os schemas exatos
> (REST, eventos, WS, provably fair) estão em `docs/CONTRACT.md`. Este arquivo cobre
> só o que é específico deste serviço.

## Responsabilidade (bounded context)

Dono do ciclo de vida da rodada e do jogo em tempo real:
- **Round** (agregado): máquina de estados `BETTING → RUNNING → CRASHED → SETTLED`.
- **Bet**: aposta de um jogador numa rodada (`PENDING → CASHED_OUT/WON/LOST/REJECTED`).
- **Crash Point** + provably fair (geração, cálculo, dados de verificação).
- Engine do multiplicador e WebSocket (server → client).

## Invariantes-chave

- O **servidor é a única fonte de verdade** do multiplicador. Cliente só renderiza os ticks.
- Uma rodada iniciada **sempre roda até `SETTLED`**, mesmo que todos desconectem no meio.
- Loop **sob demanda**: só roda com ≥1 cliente WS conectado; ocioso → `current` devolve a última `SETTLED`.
- Uma aposta por jogador por rodada; apostar só em `BETTING`; cashout só em `RUNNING`.
- `crashMultiplier` é determinado **antes** da fase de apostas (commit via `serverHash`).
- Provably fair: implementar o cálculo do crash point como **função pura testável**.

## Papel na saga (lado do jogo)

- Publica `bet.placed` (otimista, `PENDING`) e `round.settled` (uma msg por aposta liquidada).
- Consome `wallet.debit.succeeded` / `wallet.debit.failed`.
- Compensação em `failed`: marca a `Bet` como `REJECTED`, remove da lista ativa, emite `bet:rejected`
  na room privada do jogador.

## Referências no CONTRACT

REST §2 · Eventos §3 · Provably fair §4 · Curva do multiplicador §4.1 · WebSocket §5
