import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Tests live in test/, mirroring src/ (test/lib/menu.test.ts tests src/lib/menu.ts).
// test/support/ holds setup and stubs, not tests.
export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": fileURLToPath(new URL("./test/support/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./test/support/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
});
