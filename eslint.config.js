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

// Svelte 5 runes are compiler-provided globals. They are resolved by
// svelte-eslint-parser inside .svelte files, but plain `.svelte.ts` modules need
// them declared explicitly.
const svelteRuneGlobals = {
  $state: "readonly",
  $derived: "readonly",
  $effect: "readonly",
  $props: "readonly",
  $bindable: "readonly",
  $inspect: "readonly",
  $host: "readonly",
};

export default [
  // Global ignores
  {
    ignores: [
      "build/",
      "dist/",
      ".svelte-kit/",
      "node_modules/",
      // Third-party and generated bundles that are vendored into the repo.
      // Linting them produces thousands of meaningless errors (e.g. the
      // Emscripten-generated Ammo.js build and the minified New Relic agent).
      "static/ammo/",
      "static/js/",
      "static/wasm/",
      // Saved reference pages with vendored assets, not project source.
      "info/",
      // Test and build output.
      "playwright-report/",
      "test-results/",
      "coverage/",
      "technicals-wasm/target/",
      "technicals-wasm/pkg/",
    ],
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
        ...svelteRuneGlobals,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      // TypeScript resolves identifiers itself and `npm run check` is the gate
      // for that. ESLint's no-undef cannot see ambient/DOM type names such as
      // `EventListener` or `NodeJS` and reports them as undefined.
      // Turning it off for TS is the documented typescript-eslint guidance.
      "no-undef": "off",
      // Both the base rule and its TS variant flag the const-object-as-enum
      // pattern in src/types/orderTypes.ts, where `export const OrderSide` and
      // `export type OrderSide` occupy separate declaration spaces. That is
      // valid TypeScript — `npm run check` passes with zero errors — so tsc is
      // the authority here, not ESLint.
      "no-redeclare": "off",
      "@typescript-eslint/no-redeclare": "off",
      // Type-hygiene backlog, not a gate. ESLint was never wired up in this
      // project, so these two rules alone account for ~1370 pre-existing
      // findings. They stay visible as warnings so they can be burned down
      // incrementally instead of blocking every pull request on day one.
      // Tighten back to "error" once the count reaches zero.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
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
        ...svelteRuneGlobals,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      ...svelte.configs.recommended.rules,
      // Allow function declarations inside Svelte script blocks
      "no-inner-declarations": "off",
      // See the .{js,ts} block above — TypeScript owns identifier resolution.
      "no-undef": "off",
      "no-redeclare": "off",
      "@typescript-eslint/no-redeclare": "off",
      // Same pre-existing backlog as the .{js,ts} block above.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
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
