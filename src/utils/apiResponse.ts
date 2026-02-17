/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { json } from "@sveltejs/kit";

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Standard Success Response
 * { success: true, data: ... }
 */
export function jsonSuccess<T>(data: T, init?: ResponseInit) {
  return json({ success: true, data }, init);
}

/**
 * Standard Error Response
 * { success: false, error: { code, message, details } }
 */
export function jsonError(
  message: string,
  code: string = "INTERNAL_ERROR",
  status: number = 500,
  details?: unknown
) {
  return json(
    {
      success: false,
      error: {
        code,
        message,
        details,
      },
    },
    { status }
  );
}

/**
 * Maps common error types to standard JSON responses
 */
export function handleApiError(e: unknown) {
  const message = e instanceof Error ? e.message : String(e);

  if (message.includes("Validation Error") || message.includes("Zod")) {
    return jsonError(message, "VALIDATION_ERROR", 400);
  }

  if (message.includes("Unauthorized") || message.includes("401")) {
    return jsonError("Unauthorized", "AUTH_ERROR", 401);
  }

  // Bitunix/Bitget specific mappings could go here if widely used

  console.error("API Error:", e);
  return jsonError(message, "INTERNAL_ERROR", 500);
}
