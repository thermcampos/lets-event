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
      exclude: [
        "src/lib/prisma*.ts",
        "**/*.d.ts",
        "src/components/ui/**",
        // 3-line re-export of the NextAuth `handlers`; nothing to unit test.
        "src/app/api/auth/**",
      ],
      // Set a few points under the measured baseline (99.8% lines / 96.7%
      // branches at the time of writing). Ratchet up, never lower without a note.
      thresholds: {
        lines: 97,
        statements: 97,
        functions: 97,
        branches: 93,
        "src/lib/google-calendar.ts": {
          lines: 97,
          branches: 95,
          functions: 100,
        },
        "src/lib/slots.ts": { lines: 97, branches: 95 },
        "src/lib/utils.ts": { lines: 97, branches: 95 },
        "src/app/api/bookings/**": { lines: 97, branches: 90 },
        "src/lib/actions/**": { lines: 97, branches: 90 },
        "src/auth.config.ts": { lines: 100 },
        "src/auth.ts": { lines: 97 },
        "src/proxy.ts": { lines: 97 },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
