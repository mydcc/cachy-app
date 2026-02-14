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

    let result = '';
    let lastIndex = 0;
    const len = jsonString.length;
    let i = 0;

    while (i < len) {
        const char = jsonString.charCodeAt(i);

        // String detected: skip it efficiently using indexOf
        if (char === 34) { // "
            i++;
            while (i < len) {
                const closeQuote = jsonString.indexOf('"', i);
                if (closeQuote === -1) {
                    // Malformed JSON (unclosed string), but let JSON.parse handle the error later
                    i = len;
                    break;
                }

                // Check for escape sequence
                // Fast check: Is the character before the quote a backslash?
                if (jsonString.charCodeAt(closeQuote - 1) !== 92) {
                    // specific case: not escaped -> we found the end
                    i = closeQuote + 1;
                    break;
                }

                // Slow check: Count consecutive backslashes to handle cases like \\" (escaped backslash, then quote)
                let backslashCount = 0;
                let j = closeQuote - 1;
                while (j >= i && jsonString.charCodeAt(j) === 92) {
                    backslashCount++;
                    j--;
                }

                // If odd number of backslashes, the quote is escaped (e.g. \")
                // If even number, the backslash is escaped (e.g. \\"), so the quote is real
                if (backslashCount % 2 === 0) {
                     i = closeQuote + 1;
                     break;
                } else {
                    // Quote is escaped, continue searching
                    i = closeQuote + 1;
                }
            }
            continue;
        }

        // Number detected: - (45) or 0-9 (48-57)
        if (char === 45 || (char >= 48 && char <= 57)) {
            const start = i;
            i++;
            // Scan correctly formatted JSON number characters: 0-9, ., e, E, +, -
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
        return JSON.parse(jsonString);
    }

    result += jsonString.slice(lastIndex);

    return JSON.parse(result);
}
