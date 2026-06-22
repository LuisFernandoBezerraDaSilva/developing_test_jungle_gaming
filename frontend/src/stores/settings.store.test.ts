import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from './settings.store';

function reset() {
  useSettingsStore.setState({
    soundEnabled: true,
    autoCashout: { enabled: false, target: '2.00' },
    autoBet: {
      enabled: false,
      baseAmount: '10',
      strategy: 'fixed',
      stopProfit: '',
      stopLoss: '',
    },
  });
}

describe('settings.store', () => {
  beforeEach(reset);

  it('toggles sound', () => {
    expect(useSettingsStore.getState().soundEnabled).toBe(true);
    useSettingsStore.getState().toggleSound();
    expect(useSettingsStore.getState().soundEnabled).toBe(false);
  });

  it('patches auto cashout settings', () => {
    useSettingsStore.getState().setAutoCashout({ enabled: true, target: '3.50' });
    expect(useSettingsStore.getState().autoCashout).toEqual({
      enabled: true,
      target: '3.50',
    });
  });

  it('patches auto bet settings without dropping other fields', () => {
    useSettingsStore.getState().setAutoBet({ strategy: 'martingale' });
    const { autoBet } = useSettingsStore.getState();
    expect(autoBet.strategy).toBe('martingale');
    expect(autoBet.baseAmount).toBe('10');
    expect(autoBet.enabled).toBe(false);
  });
});
