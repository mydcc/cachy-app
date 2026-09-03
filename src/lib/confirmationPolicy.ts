/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * Confirmation policy — FEAT-0024.
 *
 * Which actions ask a human before they run. This module is the catalogue and
 * the defaults; `stores/confirmationPolicy.svelte.ts` owns the user's choices
 * and `services/orderGate.ts` enforces them for the actions that pass through
 * it.
 *
 * A confirmation is not a verification
 * ------------------------------------
 * FEAT-0011's gate always runs and cannot be configured away. This decides
 * only whether a human is asked as well. The distinction is load-bearing in
 * the settings copy too: a user who believes they switched off safety checks
 * behaves differently from one who knows they switched off a prompt.
 *
 * Two enforcement paths, one catalogue
 * ------------------------------------
 * Not every confirmable action is an order. Leverage, margin mode and account
 * switching never reach `orderGate` — they go to `/api/account-settings` or
 * stay client-side entirely. They are in the same catalogue anyway, because a
 * user configuring "what asks me first" should not have to learn which of
 * their actions happen to be routed through an order endpoint. What differs is
 * the enforcement: gated actions fail closed at the gate, ungated ones are
 * consulted by their call site.
 *
 * This module is pure: no I/O, no store reads, no Svelte runes. The gate
 * imports its types, and tests exercise the defaults without a DOM.
 */

/**
 * Every action a user can require a confirmation for.
 *
 * The gated members deliberately reuse the wire action names from
 * `MUTATING_ORDER_ACTIONS` in `orderGate.ts`, so the gate can look a policy
 * key up straight from the payload without a translation table — a table
 * being exactly the thing that goes stale when a new action is added.
 */
export type ConfirmableAction =
    // Routed through orderGate — enforcement is structural.
    | "place-order"
    | "close-position"
    | "flash-close-position"
    | "cancel-order"
    | "cancel-all"
    | "modify-order"
    // Not routed through orderGate — the call site consults the policy.
    | "leverage-change"
    | "margin-mode-change"
    | "account-switch";

export const CONFIRMABLE_ACTIONS: readonly ConfirmableAction[] = [
    "place-order",
    "close-position",
    "flash-close-position",
    "cancel-order",
    "cancel-all",
    "modify-order",
    "leverage-change",
    "margin-mode-change",
    "account-switch",
] as const;

/**
 * The subset the gate enforces. Anything here that a call site forgets to
 * confirm is refused rather than sent; anything outside it depends on its
 * call site, which is why the set is worth naming explicitly rather than
 * inferring.
 */
export const GATED_ACTIONS: ReadonlySet<ConfirmableAction> = new Set<ConfirmableAction>([
    "place-order",
    "close-position",
    "flash-close-position",
    "cancel-order",
    "cancel-all",
    "modify-order",
]);

/**
 * The actions whose call sites actually raise the dialog today.
 *
 * This exists because the gate fails closed, and that cuts both ways. An
 * action in `GATED_ACTIONS` whose call site never sends a `confirmedAt` is not
 * "unprotected" — it is *unusable* the moment the user switches its
 * confirmation on, because nothing can produce the authorisation the gate then
 * demands. A settings screen that offers such a switch offers a way to break
 * closing a position, which is the last thing a trader should be able to do to
 * themselves by accident.
 *
 * So the toggles for everything else are shown and disabled, with the reason
 * stated. Wiring an action means passing `confirmAs`/`confirmedAt` from its
 * call site and adding it here — the two go together, and keeping the list
 * next to `GATED_ACTIONS` makes the gap visible rather than latent.
 */
export const WIRED_ACTIONS: ReadonlySet<ConfirmableAction> = new Set<ConfirmableAction>([
    // FEAT-0330. Its cleanup cancel borrows this same authorisation, so
    // `cancel-all` needs no separate wiring for the flash-close path.
    "flash-close-position",
]);

export type ConfirmationPolicy = Record<ConfirmableAction, boolean>;

/**
 * Conservative by default: destructive and irreversible actions confirm out
 * of the box.
 *
 * The four the acceptance criteria name — flash close, leverage change,
 * margin-mode change, account switch — plus `cancel-all`, which is destructive
 * in the same way flash close is: one click, unbounded blast radius, nothing
 * to undo. `cancel-order` is not, because it names the single order it kills
 * and leaves the position alone.
 *
 * Order placement defaults off deliberately. Confirming every order makes
 * scalping unusable, and the gate already refuses an order whose numbers
 * disagree with the screen — the prompt would add friction without adding a
 * check.
 */
export const DEFAULT_CONFIRMATION_POLICY: ConfirmationPolicy = {
    "place-order": false,
    "close-position": false,
    "flash-close-position": true,
    "cancel-order": false,
    "cancel-all": true,
    "modify-order": false,
    "leverage-change": true,
    "margin-mode-change": true,
    "account-switch": true,
};

/** Narrows an arbitrary string to a catalogue member. */
export function isConfirmableAction(value: string): value is ConfirmableAction {
    return (CONFIRMABLE_ACTIONS as readonly string[]).includes(value);
}

/**
 * Fills in missing or non-boolean entries from the defaults.
 *
 * Persisted policy is Class A and survives upgrades, so a stored object
 * predates any action added later. Falling back to the default rather than to
 * `false` means a newly shipped destructive action arrives switched on, not
 * silently unguarded — the user opted out of the prompts that existed when
 * they chose, not of every prompt Cachy will ever add.
 */
export function normalizePolicy(stored: unknown): ConfirmationPolicy {
    const source = (stored ?? {}) as Record<string, unknown>;
    const result = {} as ConfirmationPolicy;

    for (const action of CONFIRMABLE_ACTIONS) {
        const value = source[action];
        result[action] = typeof value === "boolean" ? value : DEFAULT_CONFIRMATION_POLICY[action];
    }

    return result;
}

/*
 * Authorisation for an account switch — FEAT-0026.
 *
 * `account-switch` is confirmable but deliberately not gated (see the note on
 * `GATED_ACTIONS` above): a switch has no payload, no endpoint and no
 * transport, so the order gate has no jurisdiction over it, and failing
 * closed would strand a trader inside a misconfigured account they cannot
 * leave.
 *
 * That leaves the enforcement problem the gate would otherwise have solved:
 * nothing stops a call site from switching without asking, which is exactly
 * the state this action has been in since FEAT-0024 shipped its toggle. The
 * token closes it in the type system instead. `setActiveAccount` takes a
 * `SwitchAuthorization`, and the only two functions that can produce one both
 * consult the policy first — so a call site that skips the confirmation does
 * not compile.
 *
 * `switchBrand` is declared and never exported, the same construction
 * `GatePass` uses in `orderGate.ts`. Unlike `GatePass` there is no runtime
 * registry behind it: a hand-rolled `{} as SwitchAuthorization` would pass.
 * That is an accepted limit — the token is here to make the omission visible
 * to a reviewer and impossible to reach by accident, not to defend against a
 * caller deliberately forging one. Forging it changes no exchange state by
 * itself; the order gate still refuses the resulting order.
 */
declare const switchBrand: unique symbol;

export interface SwitchAuthorization {
    readonly [switchBrand]: true;
    /** When a human agreed, or null when the policy did not ask. */
    readonly confirmedAt: number | null;
}
