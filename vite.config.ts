/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, configDefaults } from "vitest/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [sveltekit(), tailwindcss()],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(
      process.env.npm_package_version,
    ),
  },
  optimizeDeps: {
    include: ["intl-messageformat"],
  },
  ssr: {
    noExternal: [
      "intl-messageformat",
      "@formatjs/icu-messageformat-parser",
      "@formatjs/icu-skeleton-parser",
      "@formatjs/fast-memoize",
      "svelte-i18n",
    ],
  },
  server: {
    fs: {
      allow: ['..']
    }
  },
  worker: {
    format: 'es',
    plugins: () => [tailwindcss()]
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    exclude: [...configDefaults.exclude, 'tests/e2e/**', '**/*.spec.ts'],
    env: {
      APP_ACCESS_TOKEN: 'test-token-123'
    }
  },
  build: {
    rollupOptions: {
      external: ["openai"], 
      output: {
        manualChunks: (id) => {
          if (id.includes("node_modules")) {
            if (id.includes("three")) return "three-vendor";
            if (id.includes("chart.js") || id.includes("chartjs-")) return "chart-vendor";
            if (id.includes("katex") || id.includes("marked")) return "markdown-vendor";
            if (id.includes("@google/generative-ai") || id.includes("openai")) return "ai-vendor";
            if (id.includes("svelte-i18n") || id.includes("intl-messageformat")) return "i18n-vendor";
            return "vendor";
          }
          // Production Hardening: Split Shaders and WASM into dedicated chunks
          if (id.includes('shaders/') && id.endsWith('.wgsl')) {
            return 'gpu-shaders';
          }
          if (id.includes('technicals-wasm') || id.includes('.wasm')) {
            return 'wasm-engine';
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
});