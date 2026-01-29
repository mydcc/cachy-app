/*
 * Copyright (C) 2026 MYDCT
 *
 * Safe JSON Parser utility
 * Hardening against JSON.parse precision loss for large integers.
 */

/**
 * Parses a JSON string while protecting large integers from precision loss.
 * It uses a regex to wrap specific keys' numeric values in quotes before parsing.
 *
 * Target keys: id, orderId, tradeId, matchId, clientOrderId
 *
 * Example:
 * Input:  {"orderId": 1234567890123456789}
 * Output: {"orderId": "1234567890123456789"}
 */
export function safeJsonParse<T = any>(jsonString: string): T {
    if (!jsonString) return jsonString as any;

    // Regex explanation:
    // "((?:id|...))"   : Capture the key name (e.g. orderId)
    // \s*:\s*          : Match colon and whitespace
    // ([0-9]{15,})     : Capture the number ONLY if it has 15 or more digits.
    //                    Standard JS safe integer is ~9e15 (16 digits).
    //                    We target 15+ to be safe.
    // Replace with: "$1": "$2" -> Quoted string

    // Note: We deliberately only target numbers >= 15 digits to avoid changing small IDs
    // that might legitimately be expected as numbers (e.g. internal db IDs).
    const protectedJson = jsonString.replace(/"((?:orderId|tradeId|matchId|id|clientOrderId))"\s*:\s*([0-9]{15,})/g, '"$1": "$2"');

    return JSON.parse(protectedJson);
}
