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

/*
 * Copyright (C) 2026 MYDCT
 *
 * Safe JSON Parser utility
 * Hardening against JSON.parse precision loss for large integers AND high-precision floats.
 */

/**
 * Parses a JSON string while protecting large numbers from precision loss.
 * It uses a regex to wrap numeric values (>= 15 chars) in quotes before parsing.
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

    // 1. Handle Object properties: "key": <number>
    // Regex: Match any number-like sequence of at least 15 characters (digits, dot, scientific notation)
    // -?            Optional negative sign
    // \d            Start with a digit
    // [\d.eE+-]{14,} Followed by 14+ characters of digits, dot, or scientific notation chars
    let protectedJson = jsonString.replace(/"([^"]+)"\s*:\s*(-?\d[\d.eE+-]{14,})(?=\s*[,}])/g, '"$1": "$2"');

    // 2. Handle Array elements: [ <number>, ... ] or , <number>
    // Matches numbers in arrays or lists
    protectedJson = protectedJson.replace(/([\[,]\s*)(-?\d[\d.eE+-]{14,})(?=\s*[,\]])/g, '$1"$2"');

    return JSON.parse(protectedJson);
}
