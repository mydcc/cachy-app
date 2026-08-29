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

import "./locales/i18n";
import { dev } from "$app/environment";
import type { HandleClientError } from "@sveltejs/kit";
import {
  installStaleDeploymentRecovery,
  isStaleChunkError,
  scheduleStaleReload,
} from "$lib/staleDeploymentRecovery";

// Recover from stale deployments: after a release replaces the build output,
// long-lived tabs fail lazy chunk imports with "Failed to fetch dynamically
// imported module". Reload once onto the fresh deployment instead of leaving
// the user stuck (skipped in dev where HMR causes transient import failures).
if (!dev && typeof window !== "undefined") {
  installStaleDeploymentRecovery();
}

export const handleError: HandleClientError = async ({ error }) => {
  // Log the error to the console (default behavior)
  console.error("Client Hook Error:", error);

  if (!dev && isStaleChunkError(error)) {
    scheduleStaleReload();
  }

  return {
    message: "An unexpected error occurred.",
    code: "UNKNOWN",
  };
};
