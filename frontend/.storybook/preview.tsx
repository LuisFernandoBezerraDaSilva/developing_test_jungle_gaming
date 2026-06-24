import type { Preview } from '@storybook/react';
import '../src/index.css';

/** Tema escuro (cassino) aplicado a todas as stories. */
const preview: Preview = {
  parameters: {
    layout: 'centered',
    controls: { expanded: true },
  },
  decorators: [
    (Story) => (
      <div className="dark" style={{ padding: 24, background: 'var(--color-background)' }}>
        <Story />
      </div>
    ),
  ],
};

export default preview;
