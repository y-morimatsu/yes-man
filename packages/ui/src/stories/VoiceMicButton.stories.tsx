import type { Meta, StoryObj } from "@storybook/react";
import { VoiceMicButton } from "../composites/VoiceMicButton";

const meta: Meta<typeof VoiceMicButton> = {
  title: "Composites/VoiceMicButton",
  component: VoiceMicButton,
  args: { onClick: () => alert("clicked") },
};
export default meta;

type Story = StoryObj<typeof VoiceMicButton>;

export const Idle: Story = { args: { state: "idle" } };
export const Recording: Story = { args: { state: "recording" } };
export const Processing: Story = { args: { state: "processing" } };
export const Error: Story = {
  args: { state: "error", errorMessage: "聞き取りに失敗しました" },
};
