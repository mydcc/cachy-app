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
 *
 * Sound channel settings — FEAT-0392.
 *
 * Volume, mute, and whether the browser will currently let the page make noise.
 * Class A: a preference about this device, stored in `localStorage` and sent
 * nowhere (ADR-0001).
 *
 * Availability is state rather than a preference, so it is held here but never
 * persisted — it is rewritten from the live `AudioContext` on every attempt by
 * `services/soundChannel.svelte.ts`. Persisting it would mean a reload could
 * claim the channel is armed before the browser has agreed to it, which is the
 * one thing this item exists to avoid.
 */

import { browser } from "$app/environment";
import { z } from "zod";
import { CONSTANTS } from "../lib/constants";
import { clampVolume, DEFAULT_SOUND_VOLUME } from "../lib/notificationTones";
import { safeJsonParse } from "../utils/safeJson";
import { StorageHelper } from "../utils/storageHelper";

const StoredSoundSchema = z.object({
    volume: z.number().optional(),
    muted: z.boolean().optional(),
});

/**
 * Why the sound channel cannot be heard, or `"ready"` when it can.
 *
 * `locked` is the autoplay case: the browser has not seen a user gesture on
 * this page yet and will refuse to start an `AudioContext`. It resolves itself
 * the moment the trader clicks anything, which is why the settings UI says
 * "after your next click" rather than offering a button that cannot work.
 */
export type SoundAvailability = "ready" | "locked" | "unsupported" | "muted";

class NotificationSoundStore {
    private _volume = $state(DEFAULT_SOUND_VOLUME);
    private _muted = $state(false);
    private _persistFailed = $state(false);

    /**
     * What the last play attempt found, or `locked` before the first one.
     *
     * Starts pessimistic on purpose: a freshly loaded page genuinely cannot
     * play, and a UI that starts out claiming "ready" would be lying for as
     * long as nobody has tried.
     */
    private _availability = $state<SoundAvailability>("locked");

    constructor() {
        if (browser) this.load();
    }

    public get volume(): number {
        return this._volume;
    }

    public get muted(): boolean {
        return this._muted;
    }

    public get persistFailed(): boolean {
        return this._persistFailed;
    }

    /** Mute folded in, so the UI has one thing to render. */
    public get availability(): SoundAvailability {
        return this._muted ? "muted" : this._availability;
    }

    /**
     * The gain the player should actually apply: zero while muted.
     *
     * Mute is not volume 0. A trader who mutes and later unmutes expects the
     * volume they chose back, and collapsing the two would lose it.
     */
    public get effectiveVolume(): number {
        return this._muted ? 0 : this._volume;
    }

    public setVolume(value: number): void {
        this._volume = clampVolume(value);
        this.persist();
    }

    public setMuted(muted: boolean): void {
        this._muted = muted;
        this.persist();
    }

    /** Called by the player with what the platform just allowed. */
    public reportAvailability(availability: Exclude<SoundAvailability, "muted">): void {
        this._availability = availability;
    }

    public reset(): void {
        this._volume = DEFAULT_SOUND_VOLUME;
        this._muted = false;
        this.persist();
    }

    private persist(): void {
        if (!browser) return;
        try {
            const ok = StorageHelper.safeSave(
                CONSTANTS.LOCAL_STORAGE_NOTIFICATION_SOUND_KEY,
                JSON.stringify({ volume: this._volume, muted: this._muted }),
            );
            this._persistFailed = !ok;
        } catch {
            this._persistFailed = true;
        }
    }

    private load(): void {
        try {
            const stored = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_NOTIFICATION_SOUND_KEY);
            if (!stored) return;
            const parsed = StoredSoundSchema.safeParse(safeJsonParse(stored));
            if (!parsed.success) return;
            // `clampVolume` rather than a zod range: a stored 1.4 from a future
            // version is a value to pull into range, not a reason to discard the
            // mute setting sitting next to it.
            this._volume = clampVolume(parsed.data.volume);
            if (typeof parsed.data.muted === "boolean") this._muted = parsed.data.muted;
        } catch {
            // Defaults stand. A failure here costs a volume preference.
        }
    }

    /** Test seam: reloads from storage as a fresh session would. */
    public reload(): void {
        this._volume = DEFAULT_SOUND_VOLUME;
        this._muted = false;
        this._availability = "locked";
        if (browser) this.load();
    }
}

export const notificationSoundStore = new NotificationSoundStore();
