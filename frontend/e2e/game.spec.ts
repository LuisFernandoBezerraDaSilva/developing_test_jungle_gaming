import { test, expect } from '@playwright/test';

/**
 * Fluxo real do jogador, ponta a ponta no navegador (bônus):
 *   login (Keycloak) → apostar → multiplicador sobe → cash out → saldo atualizado.
 *
 * Requer a stack em modo determinístico (docker-compose.e2e.yml): o crash é
 * forçado em 1.50x (~6,7s após o início), o que dá margem segura para sacar.
 */
test('login → aposta → cashout → saldo atualizado', async ({ page }) => {
  // 1) Login via Keycloak (OIDC redirect)
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar com Keycloak' }).click();

  await page.fill('#username', 'player');
  await page.fill('#password', 'player123');
  await page.click('#kc-login');

  // 2) Jogo carregou — saldo do jogador visível
  const balance = page.locator('p.text-3xl').first();
  await expect(balance).toBeVisible({ timeout: 30_000 });
  const initialBalance = (await balance.textContent())?.trim() ?? '';

  // 3) Apostar na fase BETTING
  const betButton = page.getByRole('button', { name: 'Apostar' });
  await expect(betButton).toBeEnabled({ timeout: 30_000 });
  await page.getByLabel('Valor da aposta em reais').fill('10');
  await betButton.click();

  // aposta registrada (PENDING) — saga criou a Bet
  await expect(page.getByText(/· PENDING/)).toBeVisible();

  // 4) Cash Out durante RUNNING — espera o multiplicador subir antes de sacar
  const cashoutButton = page.getByRole('button', { name: /Cash Out/ });
  await expect(cashoutButton).toBeEnabled({ timeout: 30_000 });
  await page.waitForTimeout(2000); // multiplicador > 1.10x, ainda longe do crash 1.50x
  await cashoutButton.click();

  // 5) Aposta saiu como ganha (cashout → CASHED_OUT, e WON após o crash)
  await expect(page.getByText(/· (CASHED_OUT|WON)/)).toBeVisible({ timeout: 30_000 });

  // 6) Saldo atualizado: recarrega (força refetch do saldo real do servidor) e
  //    confirma que mudou em relação ao inicial (débito da aposta + crédito do payout).
  await page.reload();
  await expect(balance).not.toHaveText(initialBalance, { timeout: 30_000 });
});
