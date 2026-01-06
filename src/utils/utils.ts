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

/**
 * Parses a timestamp that might be in seconds or milliseconds, string or number.
 * Returns the timestamp in milliseconds.
 * @param val The timestamp value (string, number, or undefined)
 * @param fallback Default value if parsing fails (default: Date.now())
 */
export function parseTimestamp(val: string | number | undefined | null, fallback: number = Date.now()): number {
    if (val === undefined || val === null || val === '') return fallback;

    let ts = typeof val === 'string' ? parseFloat(val) : val;

    if (isNaN(ts) || ts <= 0) return fallback;

    // Heuristic: If timestamp is small (e.g. less than 10 billion), it's likely in seconds.
    // 10,000,000,000 seconds is year 2286.
    // 10,000,000,000 milliseconds is ~115 days after 1970 (April 1970).
    // Since we deal with modern dates, anything below 10 billion is seconds.
    if (ts < 10000000000) {
        ts *= 1000;
    }

    return Math.floor(ts);
}
