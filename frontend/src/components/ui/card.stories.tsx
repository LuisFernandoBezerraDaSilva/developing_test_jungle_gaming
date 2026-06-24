import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card, CardHeader, CardTitle, CardContent } from './card';

const meta: Meta<typeof Card> = {
  title: 'UI/Card',
  component: Card,
};
export default meta;

type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: () => (
    <Card style={{ width: 280 }}>
      <CardHeader>
        <CardTitle>Saldo</CardTitle>
      </CardHeader>
      <CardContent>
        <p style={{ fontSize: 28, fontWeight: 700 }}>R$ 1.000,00</p>
      </CardContent>
    </Card>
  ),
};
