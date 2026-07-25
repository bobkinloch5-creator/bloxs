// Unit-test config for BloxSmith's pure logic (generators, validators,
// normalizers). Intentionally separate from vite.config.ts so the Lovable
// TanStack preset is not pulled into the test runtime.
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["node_modules/**", "dist/**", ".output/**", ".nitro/**"],
    reporters: "default",
    coverage: {
      provider: "v8",
      include: [
        "src/lib/roblox-ui-blueprint.ts",
        "src/lib/luau-validator.ts",
        "src/lib/plugin-actions.ts",
        "src/lib/rate-limit.server.ts",
      ],
    },
  },
});
