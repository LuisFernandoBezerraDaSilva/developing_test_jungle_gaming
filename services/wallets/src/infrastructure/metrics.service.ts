import { Injectable } from "@nestjs/common";
import { Registry, Counter, collectDefaultMetrics } from "prom-client";

/**
 * Observabilidade (bônus). Expõe métricas Prometheus em GET /metrics.
 * Métricas default do processo + contadores da carteira (débitos por resultado,
 * total creditado). RTP é derivado no Grafana junto com as métricas do games.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly debits = new Counter({
    name: "crash_debits_total",
    help: "Débitos processados, por resultado",
    labelNames: ["result"] as const,
    registers: [this.registry],
  });

  readonly creditedCents = new Counter({
    name: "crash_credited_cents_total",
    help: "Total creditado em payouts (WON), em centavos",
    registers: [this.registry],
  });

  constructor() {
    this.registry.setDefaultLabels({ service: "wallets" });
  }

  /**
   * Liga as métricas default do processo. Chamado só no bootstrap real
   * (main.ts) — nos testes não roda, para não deixar timers abertos.
   */
  enableDefaultMetrics(): void {
    collectDefaultMetrics({ register: this.registry });
  }

  async scrape(): Promise<string> {
    return this.registry.metrics();
  }
}
