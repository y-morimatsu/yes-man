import type { Meta, StoryObj } from "@storybook/react";
import { Toast } from "../primitives/Toast";

const meta: Meta<typeof Toast> = {
  title: "Primitives/Toast",
  component: Toast,
  args: {
    toast: { id: "t1", message: "成功しました" },
    onDismiss: () => {},
  },
};
export default meta;

type Story = StoryObj<typeof Toast>;

export const Info: Story = {};
export const Success: Story = {
  args: { toast: { id: "t1", message: "保存完了", variant: "success" } },
};
export const Error: Story = {
  args: { toast: { id: "t1", message: "エラー発生", variant: "error" } },
};
