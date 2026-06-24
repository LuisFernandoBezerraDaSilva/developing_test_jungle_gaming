import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright (bônus) — testes E2E de navegador simulando o jogador real.
 *
 * Pré-requisitos para rodar (`bun run test:e2e`):
 *   1. Stack em modo DETERMINÍSTICO (crash fixo em 1.50x, janela curta), que dá
 *      uma janela folgada (~6s) para sacar antes do crash sem flakiness:
 *        docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d
 *   2. Browser do Chromium instalado: `bunx playwright install chromium`.
 *
 * O dev server do Vite (5173) é iniciado automaticamente (ou reutilizado se já
 * estiver no ar). Só Chromium, para reduzir o download.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
