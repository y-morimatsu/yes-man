import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./tests/setup.ts"],
    environment: "jsdom",
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.stories.tsx",
        "src/icons/**",
        "src/index.ts",
        "src/**/index.ts",
      ],
      // ultrathink NFR Design I3: CI fail、自動更新せず、global aggregate
      thresholds: {
        lines: 80,
        branches: 70,
        autoUpdate: false,
        perFile: false,
      },
    },
  },
});
