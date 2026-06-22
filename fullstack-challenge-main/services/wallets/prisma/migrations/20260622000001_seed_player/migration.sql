-- Seed: wallet for the test player with R$1.000,00 (100000 cents) initial balance
-- playerId matches the fixed Keycloak user id in realm-export.json
-- ON CONFLICT DO NOTHING makes this idempotent
INSERT INTO "wallets" ("id", "playerId", "balanceCents", "currency", "createdAt", "updatedAt")
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  100000,
  'BRL',
  NOW(),
  NOW()
)
ON CONFLICT ("playerId") DO NOTHING;
