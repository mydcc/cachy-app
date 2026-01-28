/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

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
