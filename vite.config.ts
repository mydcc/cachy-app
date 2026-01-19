import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
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
  build: {
    rollupOptions: {
      external: ["openai"],
      output: {
        manualChunks: (id) => {
          if (id.includes("node_modules")) {
            if (id.includes("decimal.js") || id.includes("crypto-js")) {
              return "math-vendor";
            }
            return "vendor";
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
});
