import type { Meta, StoryObj } from "@storybook/react";
import { Card } from "../primitives/Card";

const meta: Meta<typeof Card> = {
  title: "Primitives/Card",
  component: Card,
  args: { children: "Card content here" },
};
export default meta;

type Story = StoryObj<typeof Card>;

export const Default: Story = {};
export const Clickable: Story = {
  args: {
    onClick: () => alert("clicked"),
    children: "Click me (rendered as <button>)",
  },
};
export const Article: Story = {
  args: { as: "article", children: "Semantic article element" },
};
