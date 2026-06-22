# Copilot Instructions

## Antes de qualquer trabalho em chamadas de API, WebSocket ou tipos compartilhados

Leia `docs/CONTRACT.md` primeiro. É a fonte única de verdade para:
- Schemas REST exatos que o frontend deve consumir (Game Service e Wallet Service)
- Eventos WebSocket e payloads exatos (seção 5 do contrato)
- Códigos de erro padronizados retornados pela API

Não infira formatos alternativos de payload, nomes de campos, ou nomes de eventos.
Se algo necessário não estiver coberto no `docs/CONTRACT.md`, pare e sinalize a
ambiguidade em vez de assumir — o backend está sendo gerado em paralelo por outro
agente (Claude Code) usando o mesmo contrato. Divergência de schema quebra a
integração no fim do prazo.

## Contexto do projeto

Frontend (`frontend/`) de um Crash Game (cassino online em tempo real) para um
desafio técnico com prazo apertado. Stack: Vite + React + TypeScript + Tailwind CSS
+ shadcn/ui, TanStack Query para server state, Zustand para client state.

## Regras inegociáveis

- Valores monetários do backend chegam como `string` em centavos (ex: `"10000"`).
  NUNCA converter para `number` JS para cálculo — usar BigInt ou lib decimal para
  exibição. Perda de precisão aqui é motivo de desclassificação no desafio.
- O multiplicador exibido durante a rodada vem do evento WebSocket `round:tick`
  (ver seção 5 do CONTRACT.md) — não recalcular localmente de forma independente.
  Múltiplas abas precisam mostrar exatamente o mesmo estado.
- Login via Keycloak: OIDC authorization code flow + PKCE (S256). Client ID
  `crash-game-client`, realm `crash-game`.
- Dark mode, estética cassino, responsivo — ver seção de UI/UX do desafio original
  se disponível no repo.

## Telas e componentes obrigatórios

Mapeados aos endpoints/eventos do `docs/CONTRACT.md`. Não inventar telas; estas são as exigidas.

**Login** — redirect Keycloak (OIDC code + PKCE S256), tratar callback, armazenar tokens.

**Página do Jogo (principal):**
- **Gráfico do crash** — multiplicador animado subindo de 1.00x (fonte: evento WS `round:tick`,
  nunca recalcular local); curva visual; indicação clara do crash (`round:crashed`); exibir o
  **hash da seed (`serverHash`) antes da rodada** (de `round:betting_started` / `round:snapshot`).
- **Controles de aposta** — input de valor com validação (range 100–100000 centavos); botão
  "Apostar" habilitado **só** na fase `BETTING` (`POST /games/bet`); botão "Cash Out" habilitado
  **só** em `RUNNING` com aposta `PENDING`, exibindo **payout potencial** (`POST /games/bet/cashout`);
  timer de countdown (de `bettingWindowSeconds` + `phaseStartedAt`).
- **Apostas da rodada atual** — lista em tempo real (username, valor, status) de `round:snapshot`
  + `bet:placed` / `bet:cashed_out` (broadcast). Destacar cash outs.
- **Histórico de rodadas** — últimos ~20 crash points (`GET /games/rounds/history`), código de
  cores (vermelho = crash baixo, verde = crash alto).
- **Info do jogador** — saldo em destaque (`GET /wallets/me`, atualizar em settlement), username (do JWT).

**Eventos privados:** `bet:rejected` chega na room `player:<sub>` (token no handshake WS) → toast de erro.

**UI/UX:** dark mode (estética cassino, acentos neon), responsivo (desktop + mobile), animações
(curva suave, feedback de cashout, animação de crash), loading states (skeletons/spinners),
erros via **toast** (saldo insuficiente, erro de rede etc.).

## Padrão de arquitetura (frontend)

MVC com clean code. Separação de responsabilidades:
- **Page:** controla o que aparece na página (composição/estado da rota).
- **Component:** componentes importados e reutilizados pelo produto.
- **Service:** requisições com o backend (REST) e integração externa.

## Ao iniciar uma nova sessão

Releia `docs/CONTRACT.md` antes de gerar ou modificar qualquer chamada de API ou
listener de WebSocket — mesmo se já foi lido em sessão anterior.
