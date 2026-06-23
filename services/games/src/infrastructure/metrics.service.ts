import { Injectable } from "@nestjs/common";
import { Registry, Counter, collectDefaultMetrics } from "prom-client";

/**
 * Observabilidade (bônus). Expõe métricas no formato Prometheus em GET /metrics
 * (scrapeado pelo Prometheus → Grafana). Inclui métricas default do processo
 * (CPU, memória, event loop) + contadores de jogo.
 *
 * RTP é derivado no Grafana: crash_credited_cents_total (wallets) / crash_wagered_cents_total (games).
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly betsPlaced = new Counter({
    name: "crash_bets_placed_total",
    help: "Total de apostas criadas (PENDING)",
    registers: [this.registry],
  });

  readonly wageredCents = new Counter({
    name: "crash_wagered_cents_total",
    help: "Volume total apostado, em centavos",
    registers: [this.registry],
  });

  constructor() {
    this.registry.setDefaultLabels({ service: "games" });
  }

  /**
   * Liga as métricas default do processo (CPU/memória/event loop). Chamado só no
   * bootstrap real (main.ts) — nos testes não roda, para não deixar timers abertos.
   */
  enableDefaultMetrics(): void {
    collectDefaultMetrics({ register: this.registry });
  }

  async scrape(): Promise<string> {
    return this.registry.metrics();
  }
}
