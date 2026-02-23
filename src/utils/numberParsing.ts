/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * Parses a string input into a normalized string number (dot decimal, no thousands separators).
 * Handles:
 * - Standard: "1234.56" -> "1234.56"
 * - Comma Decimal: "1234,56" -> "1234.56"
 * - US Format: "1,234.56" -> "1234.56"
 * - EU Format: "1.234,56" -> "1234.56"
 * - Mixed/Invalid: "1.2.3", "1,2,3" -> undefined
 *
 * Note: Ambiguous inputs like "1,000" are treated as "1.000" (1) if simple comma,
 * consistent with "Comma is Decimal" preference in simple fields.
 * To use thousands separators safely, user must include both separators (e.g. "1,000.00")
 * or use standard notation.
 */
export function parseLocaleNumber(input: string): string | undefined {
    if (!input) return undefined;
    const val = input.trim();
    if (!val) return undefined;

    // 1. Standard / Clean
    if (/^-?\d+(\.\d+)?$/.test(val)) return val;

    // 2. Mixed Separators (Safe to infer)
    if (val.includes(',') && val.includes('.')) {
        const lastComma = val.lastIndexOf(',');
        const lastDot = val.lastIndexOf('.');

        if (lastComma < lastDot) {
            // US/UK Style: 1,000,000.00
            // Ensure format is valid: commas must be followed by 3 digits (optional check)
            // For robustness, just strip commas
            const clean = val.replace(/,/g, '');
            return /^-?\d+(\.\d+)?$/.test(clean) ? clean : undefined;
        } else {
            // EU Style: 1.000.000,00
            const clean = val.replace(/\./g, '').replace(',', '.');
            return /^-?\d+(\.\d+)?$/.test(clean) ? clean : undefined;
        }
    }

    // 3. Single Separator
    if (val.includes(',')) {
        // "12,34" -> "12.34"
        // "1,000,000" -> Invalid (multiple decimals)
        const parts = val.split(',');
        if (parts.length === 2) {
            // Single comma: Treat as decimal
            const clean = val.replace(',', '.');
            return /^-?\d+(\.\d+)?$/.test(clean) ? clean : undefined;
        } else {
            // Multiple commas: "1,000,000"
            // Treat as thousands separators?
            // If we assume comma is decimal, this is invalid.
            // If we assume it's thousands, we should strip.
            // "1,000,000" -> "1000000"

            // Check if parts look like thousands groups (3 digits)
            // 1,000,000 -> parts[1]="000", parts[2]="000"
            const areGroupsValid = parts.slice(1).every(p => p.length === 3);
            if (areGroupsValid) {
                const clean = val.replace(/,/g, '');
                return /^-?\d+$/.test(clean) ? clean : undefined;
            }
        }
    }

    // 4. Single Separator (.) but multiple? "1.000.000"
    if (val.includes('.')) {
        const parts = val.split('.');
        if (parts.length > 2) {
             // "1.000.000" -> "1000000"
             const areGroupsValid = parts.slice(1).every(p => p.length === 3);
             if (areGroupsValid) {
                 const clean = val.replace(/\./g, '');
                 return /^-?\d+$/.test(clean) ? clean : undefined;
             }
        }
    }

    return undefined;
}
