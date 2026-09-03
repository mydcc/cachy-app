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
 * Confirmation policy store — FEAT-0024.
 *
 * The user's answer to "which actions ask me first". Class A: it is a personal
 * preference about this device's UI and never leaves it — not as telemetry,
 * not as a crash-report field (ADR-0001).
 *
 * The catalogue and the defaults live in `lib/confirmationPolicy.ts`; this
 * holds the choices and persists them. `services/orderGate.ts` enforces them
 * for gated actions via `registerConfirmationCheck`, wired up in
 * `rmsService.ts` alongside the risk limits and the kill switch.
 */

import { browser } from "$app/environment";
import { z } from "zod";
import { CONSTANTS } from "../lib/constants";
import {
    CONFIRMABLE_ACTIONS,
    DEFAULT_CONFIRMATION_POLICY,
    GATED_ACTIONS,
    WIRED_ACTIONS,
    isConfirmableAction,
    normalizePolicy,
    type ConfirmableAction,
    type ConfirmationPolicy,
    type SwitchAuthorization,
} from "../lib/confirmationPolicy";
import { safeJsonParse } from "../utils/safeJson";
import { StorageHelper } from "../utils/storageHelper";

/*
 * Permissive on purpose: the shape is validated as "an object of booleans"
 * and `normalizePolicy` decides what each key means. A stricter schema naming
 * every action would reject the whole blob when a future version adds one,
 * discarding every choice the user had made to date.
 */
const StoredPolicySchema = z.object({
    policy: z.record(z.string(), z.boolean()).optional(),
});

class ConfirmationPolicyStore {
    private _policy = $state<ConfirmationPolicy>({ ...DEFAULT_CONFIRMATION_POLICY });
    private _persistFailed = $state(false);

    constructor() {
        if (browser) this.load();
    }

    /** The current policy. Treat as read-only; use `setRequired` to change it. */
    public get policy(): ConfirmationPolicy {
        return this._policy;
    }

    /**
     * True when the last write to localStorage failed — a full quota, or a
     * browser with storage disabled. Surfaced so the settings UI can say the
     * choice will not survive a reload, rather than pretending it saved.
     */
    public get persistFailed(): boolean {
        return this._persistFailed;
    }

    /**
     * Whether this action asks the user first.
     *
     * A gated action with no dialog yet always answers `false`, whatever is
     * stored or defaulted. Answering `true` would demand an authorisation no
     * call site can produce, so the gate would refuse the action outright —
     * `cancel-all` ships defaulted on and has no user-facing call site, and a
     * policy stored before its toggle was disabled would otherwise stay armed
     * with only Reset-all to clear it.
     *
     * The stored value is left untouched rather than rewritten: wiring the
     * action later should bring the user's own choice back, not a default that
     * overwrote it.
     */
    public requires(action: ConfirmableAction): boolean {
        if (GATED_ACTIONS.has(action) && !WIRED_ACTIONS.has(action)) return false;
        return this._policy[action];
    }

    /**
     * An authorisation for a switch the policy does not require a prompt for.
     *
     * Returns `null` when it does require one — the caller must then show the
     * dialog and come back through `authorizeSwitchFromConfirmation`. Making
     * the "no prompt needed" answer the *only* unprompted producer is what
     * stops a call site from switching silently: there is no other way to
     * obtain the token.
     */
    public authorizeSwitchUnprompted(): SwitchAuthorization | null {
        if (this.requires("account-switch")) return null;
        return { confirmedAt: null } as unknown as SwitchAuthorization;
    }

    /**
     * An authorisation carrying the instant a human agreed.
     *
     * `confirmedAt` comes from `ConfirmActionModal`, which stamps it inside
     * the component on the click — "this is the instant a human actually
     * agreed", not the instant a caller got around to asking.
     */
    public authorizeSwitchFromConfirmation(confirmedAt: number): SwitchAuthorization {
        return { confirmedAt } as unknown as SwitchAuthorization;
    }

    /**
     * Whether an arbitrary wire action asks first.
     *
     * The gate hands over whatever `mutatingActionOf` read out of the payload,
     * which is a plain string and may be an action this catalogue does not
     * know. An unknown action requires no confirmation: it cannot be one the
     * user configured, and refusing it here would block orders on a typo in a
     * payload rather than on a policy the user expressed.
     */
    public requiresForWireAction(action: string): boolean {
        return isConfirmableAction(action) ? this.requires(action) : false;
    }

    /** Immutable update — a new object, never a mutated one. */
    public setRequired(action: ConfirmableAction, required: boolean): void {
        this._policy = { ...this._policy, [action]: required };
        this.persist();
    }

    /** Restores the conservative defaults. */
    public reset(): void {
        this._policy = { ...DEFAULT_CONFIRMATION_POLICY };
        this.persist();
    }

    private persist(): void {
        if (!browser) return;
        try {
            const ok = StorageHelper.safeSave(
                CONSTANTS.LOCAL_STORAGE_CONFIRMATION_POLICY_KEY,
                JSON.stringify({ policy: this._policy }),
            );
            this._persistFailed = !ok;
        } catch {
            this._persistFailed = true;
        }
    }

    private load(): void {
        try {
            const stored = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_CONFIRMATION_POLICY_KEY);
            if (!stored) return;
            const parsed = StoredPolicySchema.safeParse(safeJsonParse(stored));
            if (!parsed.success) return;
            this._policy = normalizePolicy(parsed.data.policy);
        } catch {
            /*
             * A corrupt blob leaves the defaults in place, which fails safe:
             * the defaults confirm more than most users will choose to, so the
             * worst case of an unreadable policy is an extra prompt — never a
             * missing one.
             */
        }
    }

    /** Test seam: reloads from storage as a fresh session would. */
    public reload(): void {
        this._policy = { ...DEFAULT_CONFIRMATION_POLICY };
        if (browser) this.load();
    }
}

export const confirmationPolicyStore = new ConfirmationPolicyStore();

export { CONFIRMABLE_ACTIONS, type ConfirmableAction, type ConfirmationPolicy };
