import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov", "json-summary"],
      reportsDirectory: "./coverage",
      include: [
        "src/lib/**",
        "src/app/api/**",
        "src/auth.config.ts",
        "src/auth.ts",
        "src/proxy.ts",
      ],
      exclude: ["src/lib/prisma*.ts", "**/*.d.ts", "src/components/ui/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
