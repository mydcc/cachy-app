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
 * Hardening against JSON.parse precision loss for large integers.
 */

/**
 * Parses a JSON string while protecting large integers from precision loss.
 * It uses a regex to wrap numeric values (>= 15 digits) in quotes before parsing.
 *
 * Target: Any key followed by a large integer.
 *
 * Example:
 * Input:  {"orderId": 1234567890123456789, "timestamp": 1600000000000000000}
 * Output: {"orderId": "1234567890123456789", "timestamp": "1600000000000000000"}
 */
export function safeJsonParse<T = any>(jsonString: string): T {
    if (!jsonString) return jsonString as any;
    if (typeof jsonString !== 'string') return jsonString;

    // Regex explanation:
    // "([^"]+)"                     : Capture any key (enclosed in double quotes).
    // \s*:\s*                       : Match colon and whitespace.
    // ([0-9]{15,})                  : Capture the number ONLY if it has 15 or more digits.
    // (?!\.)                        : Negative lookahead to ensure it's NOT a float (e.g. 12345.5).
    //
    // We target 15+ to be safe (JS safe int is ~9e15).
    const protectedJson = jsonString.replace(/"([^"]+)"\s*:\s*([0-9]{15,})(?!\.)/g, '"$1": "$2"');

    return JSON.parse(protectedJson);
}
