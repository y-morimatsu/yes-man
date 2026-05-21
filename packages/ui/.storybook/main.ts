import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  // @storybook/addon-essentials は未 install (devDep に無し)、storybook v8 default で
  // も最低限 controls/actions が組み込まれるので省略.
  addons: [],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  typescript: {
    reactDocgen: "react-docgen-typescript",
  },
};

export default config;
