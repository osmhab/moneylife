/** functions/.eslintrc.js
 * Config ESLint locale et isolée pour Cloud Functions.
 * - root: true empêche ESLint d'aller chercher la config du monorepo (eslint-config-next).
 * - On cible uniquement le code TypeScript des functions.
 */
module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    tsconfigRootDir: __dirname,
    project: ["./tsconfig.json", "./tsconfig.dev.json"],
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  ignorePatterns: [
    "lib/**",        // build output
    "dist/**",
    "generated/**",
    "node_modules/**",
  ],
  rules: {
    // style minimal cohérent
    quotes: ["error", "double"],
    indent: ["error", 2, { SwitchCase: 1 }],
    // désactivez/ajoutez d'autres règles si besoin
  },
};
