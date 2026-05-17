import type { Meta, StoryObj } from "@storybook/react";
import { PersonaCard } from "../composites/PersonaCard";

const meta: Meta<typeof PersonaCard> = {
  title: "Composites/PersonaCard",
  component: PersonaCard,
};
export default meta;

type Story = StoryObj<typeof PersonaCard>;

const samplePersona = {
  id: "p1",
  name: "効率派",
  description: "効率を最優先する観点",
  usage_count: 42,
  yes_acceptance_rate: 0.7,
};

export const Default: Story = { args: { persona: samplePersona } };
export const Selected: Story = { args: { persona: samplePersona, selected: true } };
export const Compact: Story = { args: { persona: samplePersona, variant: "compact" } };
export const Shared: Story = {
  args: {
    persona: { ...samplePersona, creator_anonymous_id: "yesman-abcd1234efgh5678" },
  },
};
export const Blocked: Story = {
  args: { persona: { ...samplePersona, is_blocked: true } },
};
