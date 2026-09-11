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
 * The sound channel's tones — FEAT-0392.
 *
 * Three tones, synthesised rather than loaded. The item specifies static
 * assets; this is a deliberate departure, for two reasons that both come down
 * to a tone proving itself:
 *
 *  - A committed audio file is a build artefact that drifts from the code that
 *    plays it, and a silent file looks exactly like a working one. The same
 *    failure mode as a stale `static/wasm` bundle, one subsystem over.
 *  - A file has to be fetched and decoded, which is a network request (however
 *    same-origin) and a failure path. An oscillator has neither. "Nothing
 *    reaches the network" holds more strictly here than it would with assets.
 *
 * What survives from the item's intent is the important half: the tones are
 * built in, distinguishable from each other, and come from nowhere but this
 * device.
 *
 * This module is pure: numbers only, no WebAudio, no stores, no runes. The
 * player is `services/soundChannel.svelte.ts`.
 */

import type { NotificationCategory } from "./notificationPolicy";

/** A built-in tone. */
export type NotificationToneId = "chime" | "alarm" | "error";

export const NOTIFICATION_TONE_IDS: readonly NotificationToneId[] = [
    "chime",
    "alarm",
    "error",
] as const;

/** One oscillator burst inside a tone. */
export interface TonePartial {
    readonly freqHz: number;
    /** Offset from the start of the tone. */
    readonly startMs: number;
    readonly durationMs: number;
    readonly wave: "sine" | "square" | "triangle";
    /** Peak gain of this burst before the user's volume is applied, 0..1. */
    readonly peak: number;
}

export interface ToneSpec {
    readonly id: NotificationToneId;
    readonly partials: readonly TonePartial[];
}

/**
 * The three tones, and why they sound the way they do.
 *
 * Distinguishable on three axes at once — pitch direction, rhythm, and timbre —
 * rather than on pitch alone. A trader identifying an alarm by ear in a noisy
 * room is doing it from the rhythm long before the exact frequency, and a
 * laptop speaker flattens timbre differences a studio monitor would carry.
 */
export const NOTIFICATION_TONES: Record<NotificationToneId, ToneSpec> = {
    /** Something completed. Two notes, rising, soft. Fills and cancellations. */
    chime: {
        id: "chime",
        partials: [
            { freqHz: 880, startMs: 0, durationMs: 110, wave: "sine", peak: 0.9 },
            { freqHz: 1318, startMs: 90, durationMs: 160, wave: "sine", peak: 0.75 },
        ],
    },
    /** An armed rule fired. Three hard bursts on one pitch — a telephone, not a doorbell. */
    alarm: {
        id: "alarm",
        partials: [
            { freqHz: 784, startMs: 0, durationMs: 130, wave: "triangle", peak: 1 },
            { freqHz: 784, startMs: 190, durationMs: 130, wave: "triangle", peak: 1 },
            { freqHz: 784, startMs: 380, durationMs: 190, wave: "triangle", peak: 1 },
        ],
    },
    /** Something was refused. One note, falling, blunt. */
    error: {
        id: "error",
        partials: [
            { freqHz: 440, startMs: 0, durationMs: 120, wave: "square", peak: 0.5 },
            { freqHz: 233, startMs: 100, durationMs: 220, wave: "square", peak: 0.5 },
        ],
    },
};

/**
 * Which tone a category gets.
 *
 * Four categories over three tones, so one tone is shared: a fill and a
 * cancellation both mean "an order reached its end state without a problem" and
 * the trader reads which one off the toast. What must never share a tone is the
 * armed alarm — that is the announcement the trader set up on purpose and the
 * one they need to recognise without looking.
 */
export const TONE_FOR_CATEGORY: Record<NotificationCategory, NotificationToneId> = {
    "order-filled": "chime",
    "order-cancelled": "chime",
    "order-rejected": "error",
    "alert-fired": "alarm",
};

/** How long a tone lasts, end of its last partial. */
export function toneDurationMs(spec: ToneSpec): number {
    return spec.partials.reduce((end, p) => Math.max(end, p.startMs + p.durationMs), 0);
}

export const MIN_SOUND_VOLUME = 0;
export const MAX_SOUND_VOLUME = 1;

/**
 * Loud enough to carry from a backgrounded tab, quiet enough not to be the
 * reason the trader mutes the tab.
 */
export const DEFAULT_SOUND_VOLUME = 0.6;

/** Clamps an arbitrary number into the volume range; non-numbers fall back. */
export function clampVolume(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_SOUND_VOLUME;
    return Math.min(MAX_SOUND_VOLUME, Math.max(MIN_SOUND_VOLUME, value));
}
