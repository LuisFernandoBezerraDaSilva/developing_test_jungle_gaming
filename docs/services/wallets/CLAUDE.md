# CLAUDE.md — Wallet Service

> Regras compartilhadas dos backends estão no CLAUDE.md da raiz. Os schemas exatos
> (REST, eventos) estão em `docs/CONTRACT.md`. Este arquivo cobre só o que é específico
> deste serviço.

## Responsabilidade (bounded context)

Dono da carteira do jogador:
- **Wallet** (agregado): uma por jogador, saldo, operações de crédito e débito.

## Invariantes-chave

- **Saldo nunca negativo.** Débito que deixaria o saldo negativo → falha (não aplica).
- Dinheiro em **centavos inteiros** (`BIGINT`); nunca float. Operar com BigInt/Decimal.
- Crédito e débito **só acontecem consumindo eventos** — nunca via REST.
  - **Exceção:** saldo inicial do usuário de teste via seed/migration idempotente (bootstrap).
- Consumidores **idempotentes** (`SET NX` no Redis por `eventId`), com ack manual + requeue + DLQ.
- `POST /wallets` é **idempotente** (retorna a carteira existente em vez de duplicar).

## Papel na saga (lado da carteira)

- Consome `bet.placed` → tenta debitar → publica `wallet.debit.succeeded` ou `wallet.debit.failed`
  (reason, ex: `INSUFFICIENT_BALANCE`).
- Consome `round.settled` → credita `payoutCents` quando `outcome === "WON"`.

## Referências no CONTRACT

REST §1 · Eventos §3 (idempotência, entrega/retry, `bet.placed`, `wallet.debit.*`, `round.settled`)
