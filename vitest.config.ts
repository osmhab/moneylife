import { defineConfig } from "vitest/config";

export default defineConfig({
  // Résout nativement les alias du tsconfig (@/lib/*, baseUrl "lib/...").
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node", // le moteur de calcul est du TS pur, pas de DOM
    include: ["app/**/*.test.ts", "lib/**/*.test.ts"],
  },
});
