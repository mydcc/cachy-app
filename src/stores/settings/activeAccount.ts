import { settingsState } from "../settings.svelte";
import { activeAccountFor, defaultAccountName, type ExchangeAccount } from "./accounts";

/**
 * The account an action will use — one derivation for every label.
 *
 * `activeAccountFor` is the resolver the order gate and the trade service use
 * (they pass the same three values), so a label that called
 * `accounts.find(activeAccountId)` could name an account the gate will not
 * sign for: `resolveActiveId` keeps a stored id even when it belongs to the
 * other venue, and `activeAccountFor` repairs that by falling back to the
 * venue's first account. Label what will be signed, not what was stored.
 */
export function activeAccount(): ExchangeAccount | undefined {
    return activeAccountFor(
        settingsState.accounts,
        settingsState.activeAccountId,
        settingsState.apiProvider,
    );
}

/**
 * Display-cased venue, for when there is no account to name.
 */
export function activeAccountVenueLabel(): string {
    return defaultAccountName(settingsState.apiProvider);
}

/**
 * Display name for the active account. Falls back to the display-cased venue,
 * not the lowercase provider slug: after the last account on a venue is
 * removed, the gate refuses for empty credentials, and a label reading
 * "bitunix" would look like an account name instead of the gap.
 */
export function activeAccountLabel(): string {
    return activeAccount()?.name ?? activeAccountVenueLabel();
}
