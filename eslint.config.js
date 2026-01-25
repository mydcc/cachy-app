import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import svelteParser from "svelte-eslint-parser";
import globals from "globals";

export default [
  // Global ignores
  {
    ignores: ["build/", "dist/", ".svelte-kit/", "node_modules/"],
  },

  // Base JS + TS config for all .js, .ts files
  {
    files: ["**/*.{js,ts}"],
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    languageOptions: {
      parser: tsParser,
      globals: {
        ...globals.browser, // For things like localStorage, fetch
        ...globals.node, // For things like process, __dirname
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
    },
  },

  // Svelte specific config
  {
    files: ["**/*.svelte"],
    plugins: {
      svelte: svelte,
      "@typescript-eslint": tsPlugin,
    },
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: tsParser,
      },
      globals: {
        ...globals.browser,
        ...globals.node, // SvelteKit runs in both envs
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      ...svelte.configs.recommended.rules,
      // Allow function declarations inside Svelte script blocks
      "no-inner-declarations": "off",
    },
  },

  // Test files specific config
  {
    files: ["**/*.test.ts"],
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    languageOptions: {
      globals: {
        ...globals.vitest,
      },
    },
  },
];
