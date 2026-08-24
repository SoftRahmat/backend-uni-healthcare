import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      include: ["src/**/*.ts"],
      exclude: ["src/generated/**", "src/server.ts"],
    },
  },
});
