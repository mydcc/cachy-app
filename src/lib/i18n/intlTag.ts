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
 * An `Intl` locale tag for the app's language, not the browser's.
 *
 * `toLocaleString()` follows the OS locale, so a German UI on an English
 * machine rendered an English date inside a German sentence. The hybrid
 * `de-tech` locale is not a tag `Intl` accepts, so it maps to plain `de`.
 *
 * Kept apart from `locales/i18n.ts` so components that format a date do not
 * drag the dictionary stores in, and so tests that mock those stores still
 * get the one mapping the footer and the Manage detail must share.
 */
export function intlTagFor(value: string | null | undefined): string {
  return (value ?? "en").startsWith("de") ? "de-DE" : "en-US";
}
