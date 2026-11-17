import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Cada archivo de prueba trabaja sobre su propia copia de una base migrada + integridad.sql.
    globalSetup: ["tests/setup/global.ts"],
    setupFiles: ["tests/setup/per-file.ts"],
    pool: "forks",
    testTimeout: 20_000,
    hookTimeout: 120_000,
    env: { BCRYPT_COST: "4", APP_TIMEZONE: "America/Mexico_City" },
  },
});
