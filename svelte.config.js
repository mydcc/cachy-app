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

import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://svelte.dev/docs/kit/integrations
  // for more information about preprocessors
  preprocess: vitePreprocess(),

  kit: {
    // adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
    // If your environment is not supported, or you settled on a specific environment, switch out the adapter.
    // See https://svelte.dev/docs/kit/adapters for more information about adapters.
    adapter: adapter(),
    csp: {
      mode: "auto",
      directives: {
        "default-src": ["self"],
        "script-src": [
          "self",
          "wasm-unsafe-eval",
          "https://s.cachy.app",
          "https://js-agent.newrelic.com",
          "blob:",
        ],
        "style-src": [
          "self",
          "unsafe-inline",
        ],
        "img-src": [
          "self",
          "data:",
          "https://s.cachy.app",
          "https://*.imgbb.com",
          "https://avatars.githubusercontent.com",
          "https://cdn.discordapp.com",
          "https://*.githubusercontent.com",
        ],
        "font-src": [
          "self",
          "data:",
        ],
        "object-src": ["none"],
        "base-uri": ["self"],
        "frame-ancestors": ["self"],
        "connect-src": [
          "self",
          "https://s.cachy.app",
          "https://stat.ufjdn.com",
          "https://bam.nr-data.net",
          "https://bam.eu01.nr-data.net",
          "wss://fapi.bitunix.com",
          "wss://stream.bitunix.com",
          "wss://ws.bitget.com",
          "https://api.imgbb.com",
          "https://discord.com",
          "https://generativelanguage.googleapis.com",
          "https://api.openai.com",
        ],
      },
    },
  },
};

export default config;
