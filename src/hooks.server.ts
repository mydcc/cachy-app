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

import { sequence } from "@sveltejs/kit/hooks";
import type { Handle } from "@sveltejs/kit";
import { building } from "$app/environment";
import { CONSTANTS } from "./lib/constants";
import { logger } from "$lib/server/logger";

// --- Global Console Interceptor for CachyLog ---
// Redirects all server-side console logs to the centralized logger and SSE stream
if (!(global as any)._isConsolePatched) {
  (global as any)._isConsolePatched = true;

  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = (...args: any[]) => {
    const msg = args
      .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
      .join(" ");
    // Prevent infinite loop if logger calls console.log (it shouldn't, but safety first)
    // We use a specific prefix if we wanted to detect our own logs, but logger.ts is clean.
    logger.info(msg);
    originalLog.apply(console, args);
  };

  console.warn = (...args: any[]) => {
    const msg = args
      .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
      .join(" ");
    logger.warn(msg);
    originalWarn.apply(console, args);
  };

  console.error = (...args: any[]) => {
    const msg = args
      .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
      .join(" ");
    logger.error(msg);
    originalError.apply(console, args);
  };

  logger.info("Global console patched for CachyLog");
}

const loggingHandler: Handle = async ({ event, resolve }) => {
  const start = Date.now();
  const { method } = event.request;
  const path = event.url.pathname;
  const fullUrl = event.url.pathname + (building ? "" : event.url.search);

  // Ignoriere den Log-Stream selbst, um Endlos-Schleifen zu vermeiden
  if (path.includes("/api/stream-logs")) {
    return resolve(event);
  }

  // Log Request Eingang
  // Wir loggen keine Bodies hier, da das Lesen des Streams ihn verbrauchen könnte (SvelteKit spezifisch)
  logger.info(`[REQ] ${method} ${fullUrl}`);

  try {
    const response = await resolve(event);
    const duration = Date.now() - start;

    // Log Response mit Status und Dauer
    if (response.status === 429 || response.status === 401) {
      // 429: Rate Limit, 401: Missing/Invalid API Key - both are warnings, not critical errors
      logger.warn(
        `[RES] ${method} ${path} -> ${response.status} (${duration}ms)`,
      );
    } else if (response.status >= 400) {
      logger.error(
        `[RES] ${method} ${path} -> ${response.status} (${duration}ms)`,
      );
    } else {
      logger.info(
        `[RES] ${method} ${fullUrl} -> ${response.status} (${duration}ms)`,
      );
    }

    return response;
  } catch (err: any) {
    const duration = Date.now() - start;
    logger.error(
      `[ERR] ${method} ${path} failed (${duration}ms): ${err.message}`,
    );
    throw err;
  }
};

const themeHandler: Handle = async ({ event, resolve }) => {
  const theme = event.cookies.get(CONSTANTS.LOCAL_STORAGE_THEME_KEY) || "dark";

  const response = await resolve(event, {
    transformPageChunk: ({ html }) => {
      // Replace the <body> tag with the theme class
      let bodyClass = "";
      if (theme !== "dark") {
        bodyClass = `theme-${theme}`;
      }
      // Use a regex to find the <body> tag and inject the class
      return html.replace(/<body(.*?)>/, `<body class="${bodyClass}"$1>`);
    },
  });

  return response;
};

export const handle = sequence(loggingHandler, themeHandler);
