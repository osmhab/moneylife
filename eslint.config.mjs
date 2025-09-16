import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },

  // ✅ Override temporaire : on désactive "no-explicit-any" dans notre code app/lib/scripts
  {
    files: [
      "app/**/*.ts",
      "app/**/*.tsx",
      "lib/**/*.ts",
      "lib/**/*.tsx",
      "scripts/**/*.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      // moins bloquant : passe en warn
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "prefer-const": "warn",
    },
  },
];

export default eslintConfig;
