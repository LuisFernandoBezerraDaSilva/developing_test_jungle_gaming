import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AutoBetStrategy } from '@/lib/autobet';

/**
 * Client state de preferências do jogador (Zustand + persist no localStorage):
 * som, auto-cashout e auto-bet (bônus). Valores monetários ficam como string de
 * reais aqui (input do usuário) e são convertidos para centavos na orquestração.
 */

export type AutoCashoutSettings = {
  enabled: boolean;
  /** Multiplicador-alvo "x.xx" (ex: "2.00"). */
  target: string;
};

export type AutoBetSettings = {
  enabled: boolean;
  /** Valor base em reais (ex: "10"). */
  baseAmount: string;
  strategy: AutoBetStrategy;
  /** Lucro alvo em reais para parar (vazio = sem limite). */
  stopProfit: string;
  /** Perda máxima em reais para parar (vazio = sem limite). */
  stopLoss: string;
};

type SettingsState = {
  soundEnabled: boolean;
  autoCashout: AutoCashoutSettings;
  autoBet: AutoBetSettings;
  toggleSound: () => void;
  setAutoCashout: (patch: Partial<AutoCashoutSettings>) => void;
  setAutoBet: (patch: Partial<AutoBetSettings>) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      soundEnabled: true,
      autoCashout: { enabled: false, target: '2.00' },
      autoBet: {
        enabled: false,
        baseAmount: '10',
        strategy: 'fixed',
        stopProfit: '',
        stopLoss: '',
      },

      toggleSound() {
        set((s) => ({ soundEnabled: !s.soundEnabled }));
      },

      setAutoCashout(patch) {
        set((s) => ({ autoCashout: { ...s.autoCashout, ...patch } }));
      },

      setAutoBet(patch) {
        set((s) => ({ autoBet: { ...s.autoBet, ...patch } }));
      },
    }),
    { name: 'crash-game-settings' },
  ),
);
