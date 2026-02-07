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

    // Fast Path: Check if protection is even needed.
    // This simple check gives a ~50% speedup for small/safe messages.
    if (!/\d[\d.eE+-]{14,}/.test(jsonString)) {
        return JSON.parse(jsonString);
    }

    // Combined Regex: Handles both "key": number and [number] / , number contexts in one pass.
    // Group 1: Prefix (Key-Value style OR Array/List style)
    // Group 2: Number
    // Refined regex to handle escaped quotes in keys: "(?:[^"\\]|\\.)*"
    const protectedJson = jsonString.replace(
        /((?:"(?:[^"\\]|\\.)*"\s*:\s*)|(?:[\[,]\s*))(-?\d[\d.eE+-]{14,})(?=\s*[,}\]])/g,
        '$1"$2"'
    );

    return JSON.parse(protectedJson);
}
