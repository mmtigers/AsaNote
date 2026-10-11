import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "e2e-supabase/**/*.test.ts", "../../supabase/functions/**/*.test.ts"],
    // 計測・可視化が目的で、閾値によるCI失敗は現段階では設けない
    // (テストが充実してきた段階で導入を再検討する)。数値は CI の job summary に出る
    // (json-summary → scripts/coverage-summary.mjs。#207)。
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
