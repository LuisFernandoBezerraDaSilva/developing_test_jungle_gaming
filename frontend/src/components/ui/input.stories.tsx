import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from './input';

const meta: Meta<typeof Input> = {
  title: 'UI/Input',
  component: Input,
  args: { placeholder: '0,00' },
  argTypes: { disabled: { control: 'boolean' } },
};
export default meta;

type Story = StoryObj<typeof Input>;

export const Default: Story = {};
export const WithValue: Story = { args: { defaultValue: '10' } };
export const Disabled: Story = { args: { disabled: true, defaultValue: '10' } };
