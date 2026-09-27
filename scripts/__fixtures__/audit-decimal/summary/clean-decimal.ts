// BUG-0534 fixture — a clean `.ts` file: a Decimal.js importer with no native
// conversion. Pairs with `safe-marked.svelte` so the summary case holds one
// passing file of each kind and can assert both counts.
import { Decimal } from "decimal.js";

export function half(value: Decimal): Decimal {
    return value.div(2);
}
