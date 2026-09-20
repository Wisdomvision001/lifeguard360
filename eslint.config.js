// eslint.config.js — flat config for Lifeguard360.
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "legacy", "playwright-report", "test-results"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "warn",
    },
  },
  {
    files: ["**/*.test.{ts,tsx}", "src/test/**"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ["e2e/**"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // Node-side tooling (dataset seeder, rules test) — node globals, not browser.
    files: ["tools/**", "firestore.rules.test.ts", "vitest.rules.config.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
  },
);
