import type { StorybookConfig } from '@storybook/react-vite';

/**
 * Storybook (bônus) — biblioteca/documentação viva dos componentes de UI.
 * Reaproveita o vite.config.ts do projeto (alias `@`, Tailwind v4), então os
 * mesmos imports/estilos da app valem nas stories.
 */
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: [],
  framework: { name: '@storybook/react-vite', options: {} },
};

export default config;
