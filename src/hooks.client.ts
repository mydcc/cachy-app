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
import type { HandleClientError } from "@sveltejs/kit";
import { julesService } from "./services/julesService";

export const handleError: HandleClientError = async ({ error, event }) => {
  // Log the error to the console (default behavior)
  console.error("Client Hook Error:", error);

  // Automatically report critical errors to Jules
  // We wrap this in a try-catch to ensure the error handler itself doesn't crash
  try {
    await julesService.reportToJules(error, "AUTO");
  } catch (reportErr) {
    console.warn("Failed to send error report to Jules:", reportErr);
  }

  return {
    message: "An unexpected error occurred. Jules has been notified.",
    code: "UNKNOWN",
  };
};
