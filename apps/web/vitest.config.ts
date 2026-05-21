import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    setupFiles: ["./tests/setup.ts"],
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "http://localhost/",
      },
    },
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      // features は coverage 対象に含める (品質ゲートを features にも適用、空転防止).
      // 旧 exclude "src/features/**" は test 不在時の暫定処置で、tests/features/* 整備後は不要.
      exclude: [
        "src/**/*.stories.tsx",
        "src/main.tsx",
      ],
      thresholds: {
        lines: 75,
        branches: 65,
        autoUpdate: false,
        perFile: false,
      },
    },
  },
});
