import { defineConfig } from "vitest/config";

// アプリ(apps/asa, apps/yoru)と同じ jsdom 環境で動かす。移す前のテストを無変更で通すため。
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}"],
    },
  },
});
