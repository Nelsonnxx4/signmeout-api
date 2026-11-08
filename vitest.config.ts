import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/signmeout_test",
      FRONTEND_URL: "http://localhost:5173",
    },
    coverage: {
      reporter: ["text", "html"],
    },
  },
});

