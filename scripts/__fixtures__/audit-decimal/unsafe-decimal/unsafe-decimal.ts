// BUG-0534 fixture — the `.ts` path must behave exactly as before: a
// Decimal.js importer with a native conversion is still flagged.
import { Decimal } from "decimal.js";

export function half(value: string): number {
    return Number(value) / 2;
}

export const one = new Decimal(1);
