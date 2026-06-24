import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './button';

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  args: { children: 'Apostar' },
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'accent', 'destructive', 'secondary', 'outline', 'ghost'],
    },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    disabled: { control: 'boolean' },
  },
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = { args: { variant: 'primary' } };
export const Accent: Story = { args: { variant: 'accent', children: 'Cash Out' } };
export const Outline: Story = { args: { variant: 'outline', children: 'Verificar rodada' } };
export const Disabled: Story = { args: { disabled: true } };

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      {(['primary', 'accent', 'destructive', 'secondary', 'outline', 'ghost'] as const).map(
        (v) => (
          <Button key={v} variant={v}>
            {v}
          </Button>
        ),
      )}
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Button size="sm">sm</Button>
      <Button size="md">md</Button>
      <Button size="lg">lg</Button>
    </div>
  ),
};
