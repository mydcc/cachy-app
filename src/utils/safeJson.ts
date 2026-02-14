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
 * Safe JSON Parser utility
 * Hardening against JSON.parse precision loss for large integers AND high-precision floats.
 */

/**
 * Parses a JSON string while protecting large numbers from precision loss.
 * It uses a smart scanner to wrap numeric values (>= 15 chars) in quotes before parsing.
 *
 * Target: Any key followed by a large integer or high-precision float.
 *
 * Example:
 * Input:  {"id": 1234567890123456789, "val": 12345.123456789012}
 * Output: {"id": "1234567890123456789", "val": "12345.123456789012"}
 */
export function safeJsonParse<T = any>(jsonString: string): T {
    if (!jsonString) return jsonString as any;
    if (typeof jsonString !== 'string') return jsonString;

    // Fast Path: Check if protection is even needed.
    // This simple check gives a significant speedup for small/safe messages.
    // We look for a digit followed by at least 14 other number-like characters.
    if (!/\d[\d.eE+-]{14,}/.test(jsonString)) {
        return JSON.parse(jsonString);
    }

    let result = '';
    let lastIndex = 0;
    const len = jsonString.length;
    let i = 0;

    while (i < len) {
        const char = jsonString.charCodeAt(i);

        // String detected: skip it
        if (char === 34) { // "
            i++;
            while (i < len) {
                const c = jsonString.charCodeAt(i);
                if (c === 34) { // "
                    i++;
                    break;
                } else if (c === 92) { // \ (escape)
                    i += 2; // Skip the escaped character
                } else {
                    i++;
                }
            }
            continue;
        }

        // Number detected: - (45) or 0-9 (48-57)
        if (char === 45 || (char >= 48 && char <= 57)) {
            const start = i;
            i++;
            // Scan correctly formatted JSON number characters: 0-9, ., e, E, +, -
            // 0-9 (48-57), . (46), e (101), E (69), + (43), - (45)
            while (i < len) {
                const c = jsonString.charCodeAt(i);
                if ((c >= 48 && c <= 57) || c === 46 || c === 101 || c === 69 || c === 43 || c === 45) {
                    i++;
                } else {
                    break;
                }
            }

            // Check length of the number sequence
            if (i - start >= 15) {
                // Determine if it's truly a number context (simplistic check, but valid JSON implies it)
                // We append the string up to the number, then the quoted number
                result += jsonString.slice(lastIndex, start) + '"' + jsonString.slice(start, i) + '"';
                lastIndex = i;
            }
            continue;
        }

        // Advance for other characters
        i++;
    }

    // Append remaining part
    if (lastIndex === 0) {
        // No replacements made, fallback to original string (should be caught by Fast Path, but just in case)
        return JSON.parse(jsonString);
    }

    result += jsonString.slice(lastIndex);

    return JSON.parse(result);
}
