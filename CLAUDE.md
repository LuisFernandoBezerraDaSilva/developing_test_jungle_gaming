# CLAUDE.md

## Antes de qualquer trabalho em API, eventos ou WebSocket

Leia `docs/CONTRACT.md` primeiro. É a fonte única de verdade para:
- Schemas REST exatos (Game Service e Wallet Service)
- Eventos RabbitMQ e estratégia de saga (Game ↔ Wallet)
- Especificação do algoritmo provably fair
- Eventos WebSocket e payloads

Não infira formatos alternativos de payload, nomes de eventos, ou códigos de erro.
Se algo necessário não estiver coberto no CONTRACT.md, **pare e sinalize a ambiguidade**
em vez de assumir — este projeto tem outro agente (GitHub Copilot) trabalhando no
frontend em paralelo usando o mesmo contrato, e divergência quebra a integração.

## Contexto do projeto

Desafio técnico full-stack (Crash Game) com prazo apertado. Dois serviços backend
(`services/games`, `services/wallets`) em NestJS/TypeScript strict, DDD
(domain/application/infrastructure/presentation), comunicação via RabbitMQ.

Cada serviço tem seu próprio CLAUDE.md (`services/games/CLAUDE.md`,
`services/wallets/CLAUDE.md`) com responsabilidades e invariantes específicos —
carregado sob demanda ao trabalhar naquele serviço. Este arquivo da raiz cobre só o
que é comum aos dois.

Prioridades nesta ordem: (1) critérios eliminatórios do desafio, (2) qualidade de
arquitetura/DDD, (3) testes, (4) bônus — só depois de 1-3 estarem sólidos.

## Regras inegociáveis

- Dinheiro NUNCA em float. BIGINT (centavos) ou Decimal. Sem exceção.
- TypeScript strict mode.
- Toda mudança de schema/evento → atualizar `docs/CONTRACT.md` na mesma sessão,
  não depois.
- Testes unitários para: ciclo de vida do Round, lógica de Bet, Wallet
  (crédito/débito/saldo insuficiente), cálculo provably fair.

## Padrão de arquitetura (backend)

DDD com clean code. Separação de responsabilidades:
- **Controller (presentation):** filtra a entrada, garante o tipo, e encaminha ao
  domínio. Não contém regra de negócio.
- **Domínio:** regras de negócio (agregados, value objects, invariantes).
- **Service (application/infrastructure):** orquestra casos de uso e conexões
  externas/serviços (broker, IdP, persistência) de forma geral.

## Ao iniciar uma nova sessão

Releia `docs/CONTRACT.md` antes de gerar ou modificar qualquer código que toque
API, eventos ou WebSocket — mesmo se já foi lido em sessão anterior.
