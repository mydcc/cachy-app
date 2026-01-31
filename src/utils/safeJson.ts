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
