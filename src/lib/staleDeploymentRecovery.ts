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

/**
 * Stale-deployment recovery for failed lazy imports.
 *
 * Every adapter-node release replaces the build output, so content-hashed
 * chunks (`_app/immutable/...`) referenced by an app shell that predates the
 * deployment no longer exist on the server. Tabs that stay open for hours or
 * days (typical for a trading app) then fail their next lazy route/vendor
 * import with a browser-specific rejection:
 *
 * - Chrome/Chromium: "Failed to fetch dynamically imported module: <url>"
 * - Firefox:         "error loading dynamically imported module <url>"
 * - Safari/WebKit:   "Importing a module script failed."
 *
 * The client cannot reconstruct a deleted chunk; the only safe recovery is a
 * single hard reload onto the current deployment, guarded so it can never
 * become a reload loop.
 */

const STALE_RELOAD_FLAG = "cachy:stale-chunk-reload";

/** Secondary guard for sessions where sessionStorage is unavailable. */
let reloadScheduled = false;

function extractMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    // Rejection reasons are not always Error instances (e.g. serialized
    // objects crossing module boundaries).
    return (error as { message: string }).message;
  }
  return "";
}

export function isStaleChunkError(error: unknown): boolean {
  const message = extractMessage(error);
  if (!message) return false;

  const normalized = message.toLowerCase();
  // The literals below match browser-generated error messages, not UI copy:
  // they are English in every locale and must never be translated.
  return (
    normalized.includes("failed to fetch dynamically imported module") || // i18n-ignore
    normalized.includes("error loading dynamically imported module") || // i18n-ignore
    normalized.includes("importing a module script failed") // i18n-ignore
  );
}

/** Returns true when this call initiated (or had already scheduled) the reload. */
export function scheduleStaleReload(): boolean {
  if (reloadScheduled) return true;
  try {
    if (sessionStorage.getItem(STALE_RELOAD_FLAG) !== null) {
      reloadScheduled = true;
      return true;
    }
    sessionStorage.setItem(STALE_RELOAD_FLAG, String(Date.now()));
  } catch {
    // sessionStorage unavailable (privacy mode etc.): fall through and rely
    // on the in-memory flag so recovery still happens exactly once per page.
  }
  reloadScheduled = true;
  location.reload();
  return true;
}

export function installStaleDeploymentRecovery(): () => void {
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    if (isStaleChunkError(event.reason)) {
      event.preventDefault();
      scheduleStaleReload();
    }
  };

  window.addEventListener("unhandledrejection", onUnhandledRejection);
  return () => {
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}
