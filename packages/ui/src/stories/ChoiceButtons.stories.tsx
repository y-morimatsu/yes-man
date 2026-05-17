import type { Meta, StoryObj } from "@storybook/react";
import { ChoiceButtons } from "../composites/ChoiceButtons";

const meta: Meta<typeof ChoiceButtons> = {
  title: "Composites/ChoiceButtons",
  component: ChoiceButtons,
  args: {
    proposalText: "ランチは効率派が推す吉野家にしましょう。",
    onYes: () => alert("Yes"),
    onNo: () => alert("No"),
  },
};
export default meta;

type Story = StoryObj<typeof ChoiceButtons>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
