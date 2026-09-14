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

/*
 * Resolves a pattern display name from the locale catalogue with a fallback
 * to the name compiled into the pattern data. Used by the Academy search so
 * filtering follows the active language (previously the candlestick search
 * filtered on the English `p.name` only, breaking DE search).
 *
 * Kept in plain TypeScript (no runes) so it is unit-testable without a
 * component mount. `translate` is the `$_` store value, which echoes the key
 * when a translation is missing.
 */

/** Returns the localized name, or `fallbackName` when the key is untranslated. */
export function resolvePatternName(
   translate: (key: string) => string,
   i18nKey: string,
   fallbackName: string,
): string {
   const text = translate(i18nKey);
   if (!text || text === i18nKey) {
      return fallbackName;
   }
   return text;
}
