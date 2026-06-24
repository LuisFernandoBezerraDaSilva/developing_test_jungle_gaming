import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'tests', 'prisma'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: { sourceType: 'module' },
    },
    rules: {
      // Permite `_`-prefixo para parâmetros intencionalmente não usados.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // `any` é desencorajado (warning) — alvo de melhoria contínua, não bloqueia.
      '@typescript-eslint/no-explicit-any': 'warn',
      // catch vazio é permitido só no shutdown (best-effort ao fechar conexões).
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
);
