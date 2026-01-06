import { Decimal } from 'decimal.js';

export function debounce<T extends (...args: unknown[]) => void>(func: T, delay: number) {
    let timeout: ReturnType<typeof setTimeout>;
    return function(this: ThisParameterType<T>, ...args: Parameters<T>) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

export function parseDecimal(value: string | number | null | undefined): Decimal {
    if (value === null || value === undefined) {
        return new Decimal(0);
    }
    // Convert to string to handle both numbers and strings uniformly
    const stringValue = String(value).replace(',', '.').trim();

    // If the string is empty after trimming, it's a 0.
    if (stringValue === '') {
        return new Decimal(0);
    }

    // Check if the result is a finite number
    if (!isFinite(Number(stringValue))) {
        return new Decimal(0);
    }

    // If all checks pass, create the new Decimal
    return new Decimal(stringValue);
}

export function formatDynamicDecimal(value: Decimal | string | number | null | undefined, maxPlaces = 4): string {
    if (value === null || value === undefined) return '-';

    const dec = new Decimal(value);
    if (dec.isNaN()) return '-';

    // Format to a fixed number of decimal places, then remove trailing zeros
    const formatted = dec.toFixed(maxPlaces);

    // If it's a whole number after formatting, return it without decimals.
    if (new Decimal(formatted).isInteger()) {
        return new Decimal(formatted).toFixed(0);
    }

    // Otherwise, remove only the trailing zeros and the decimal point if it's the last char
    return formatted.replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * Robustly parses a timestamp from various input types.
 * @param value Input value (number, string, date, null, undefined)
 * @returns Timestamp in milliseconds or 0 if invalid
 */
export function parseTimestamp(value: unknown): number {
    if (value === null || value === undefined) {
        return 0;
    }

    if (typeof value === 'number') {
        return isNaN(value) ? 0 : value;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed === '') return 0;

        // Try parsing as integer first
        const parsedInt = parseInt(trimmed, 10);

        // Check if the original string was purely numeric (except possibly whitespace)
        // This distinguishes "123" (valid) from "2023-01-01" (which parseInt might read as 2023)
        // If it's purely numeric, return the integer.
        if (/^-?\d+$/.test(trimmed)) {
            return isNaN(parsedInt) ? 0 : parsedInt;
        }

        // Try parsing as Date string (ISO, etc.)
        const date = new Date(trimmed);
        const time = date.getTime();
        if (!isNaN(time)) {
            return time;
        }
    }

    if (value instanceof Date) {
        const time = value.getTime();
        return isNaN(time) ? 0 : time;
    }

    return 0;
}

/**
 * Parses a date string which might be in German format (DD.MM.YYYY) into a Date object.
 * @param dateStr Date string (e.g., "23.12.2025" or "2025-12-23")
 * @param timeStr Time string (e.g., "19:40:08")
 * @returns Date object
 */
export function parseDateString(dateStr: string, timeStr: string): Date {
    if (!dateStr) return new Date();

    let isoDate = dateStr;
    // Check for German format DD.MM.YYYY
    if (dateStr.includes('.')) {
        const parts = dateStr.split('.');
        if (parts.length === 3) {
            // Reassemble to YYYY-MM-DD
            // Assuming DD.MM.YYYY
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parts[2];
            isoDate = `${year}-${month}-${day}`;
        }
    }

    const isoTime = timeStr ? timeStr.trim() : '00:00:00';

    // Attempt to construct ISO string YYYY-MM-DDTHH:mm:ss
    const combined = `${isoDate}T${isoTime}`;
    const d = new Date(combined);

    if (isNaN(d.getTime())) {
        // Fallback for other formats if ISO construction fails
        return new Date(`${dateStr} ${timeStr}`);
    }
    return d;
}
