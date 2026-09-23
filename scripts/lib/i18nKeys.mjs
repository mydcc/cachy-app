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

/**
 * Shared i18n key helpers for build scripts.
 *
 * Single source of truth for flattening nested locale objects into
 * dot-separated key lists. Used by `scripts/generate-i18n-types.js`
 * and `scripts/validate-i18n.js` (FEAT-0535).
 */

/**
 * Flatten a nested locale object into dot-separated key paths.
 * Arrays are treated as leaf values (pushed as a single key).
 *
 * @param {object} obj - Nested locale object.
 * @param {string} [prefix=''] - Key prefix for recursion.
 * @returns {string[]} Flat list of dot-separated keys.
 */
export function flattenKeys(obj, prefix = '') {
    let keys = [];
    for (const key in obj) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
            keys = keys.concat(flattenKeys(obj[key], prefix + key + '.'));
        } else {
            keys.push(prefix + key);
        }
    }
    return keys;
}
