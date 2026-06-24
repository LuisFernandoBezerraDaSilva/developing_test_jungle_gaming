/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Vitest cobre só os testes unitários em src/. Os E2E de browser ficam em
    // e2e/ e rodam pelo Playwright (test:e2e) — não pelo Vitest.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
