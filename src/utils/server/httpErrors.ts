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
 * Single source of truth for the upstream status-error guard (FEAT-0536).
 *
 * The API routes under `src/routes/api/` throw `{ status, message }` when an
 * upstream venue responds with a non-2xx status. This guard recognises that
 * shape so routes can re-emit the upstream status code instead of a generic
 * 500. A fix to the guard belongs here — not in four identical copies.
 */
export interface StatusError {
  status: number;
  message: string;
}

export function isStatusError(error: unknown): error is StatusError {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    "message" in error &&
    typeof (error as { status: unknown }).status === "number" &&
    typeof (error as { message: unknown }).message === "string"
  );
}
