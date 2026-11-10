import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Integration tests share one test database; run files one at a time.
    fileParallelism: false,
    setupFiles: ["tests/setup-env.ts"],
    testTimeout: 20000,
  },
});
