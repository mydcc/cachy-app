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
 * The sound channel — FEAT-0392.
 *
 * Synthesises a tone through WebAudio. No assets, no fetch, nothing that can
 * arrive half-decoded: the tone specs in `lib/notificationTones.ts` are numbers
 * and this turns them into oscillators.
 *
 * Every failure path here returns `false` rather than throwing. The channel sits
 * behind `notificationService`, which has already delivered on the in-app
 * channel by the time this runs — an alarm the speaker refused is not a reason
 * for the toast to fail too. What the channel owes instead is honesty: it writes
 * what the platform actually allowed into `notificationSoundStore`, so the
 * settings UI can say "not yet" rather than showing a switch that reads on.
 */

import {
    NOTIFICATION_TONES,
    toneDurationMs,
    type NotificationToneId,
    type TonePartial,
} from "../lib/notificationTones";
import { notificationSoundStore } from "../stores/notificationSound.svelte";
import { logger } from "./logger";

/**
 * How long the gain ramps in and out of each burst.
 *
 * An oscillator switched on at full gain produces a click — a discontinuity in
 * the waveform, which on a laptop speaker is louder than the tone. 8ms is short
 * enough to leave a 110ms burst sounding immediate.
 */
const RAMP_MS = 8;

type AudioContextCtor = new () => AudioContext;

function audioContextCtor(): AudioContextCtor | null {
    const scope = globalThis as typeof globalThis & {
        AudioContext?: AudioContextCtor;
        webkitAudioContext?: AudioContextCtor;
    };
    // Older Safari only has the prefixed constructor; a test environment has
    // neither, which is `unsupported` rather than an error.
    return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

class SoundChannel {
    private ctx: AudioContext | null = null;

    /**
     * One context for the page's lifetime.
     *
     * A browser caps how many an origin may hold, and a new one per alarm hits
     * that cap in a busy session — then every later tone fails for a reason
     * that has nothing to do with the trader's settings.
     */
    private context(): AudioContext | null {
        if (this.ctx) return this.ctx;

        const Ctor = audioContextCtor();
        if (!Ctor) {
            notificationSoundStore.reportAvailability("unsupported");
            return null;
        }

        try {
            this.ctx = new Ctor();
            return this.ctx;
        } catch (e) {
            logger.warn("market", "[Sound] The platform refused an AudioContext", e);
            notificationSoundStore.reportAvailability("unsupported");
            return null;
        }
    }

    /**
     * Whether a tone would be heard right now, without making one.
     *
     * Read by the settings UI. It deliberately does not construct a context:
     * constructing one is itself subject to the autoplay rules on some
     * platforms, and a settings screen that merely rendered should not be the
     * thing that burns the page's one chance to start audio.
     */
    public isReady(): boolean {
        return this.ctx !== null && this.ctx.state === "running";
    }

    /**
     * Plays a tone. `true` only when it actually started.
     *
     * Called from `notificationService`, which puts `"sound"` in its delivered
     * list exactly when this says so — which is what lets a test assert that an
     * alarm was heard rather than that a function was called.
     */
    public play(toneId: NotificationToneId): boolean {
        const volume = notificationSoundStore.effectiveVolume;
        // Muted is not a failure, and not availability either: the trader asked
        // for silence on this channel and got it. The other channels are
        // untouched — they never consult this.
        if (volume <= 0) return false;

        const ctx = this.context();
        if (!ctx) return false;

        if (ctx.state !== "running") {
            /*
             * The autoplay case. A browser will not start audio before the page
             * has seen a user gesture, and this alarm is arriving on a page
             * nobody has touched. Ask anyway — if a gesture has happened since
             * the context was created, the resume lands and the *next* tone is
             * heard — but report the channel as unheard for this one.
             */
            void ctx.resume().then(
                () => notificationSoundStore.reportAvailability(this.isReady() ? "ready" : "locked"),
                () => notificationSoundStore.reportAvailability("locked"),
            );
            notificationSoundStore.reportAvailability("locked");
            return false;
        }

        const spec = NOTIFICATION_TONES[toneId];
        try {
            for (const partial of spec.partials) this.schedule(ctx, partial, volume);
            notificationSoundStore.reportAvailability("ready");
            return true;
        } catch (e) {
            logger.warn("market", `[Sound] Scheduling the ${toneId} tone failed`, e);
            return false;
        }
    }

    /**
     * Starts audio from inside a user gesture, and plays the tone as proof.
     *
     * The settings UI's preview button. It is the same code path an alarm takes,
     * on purpose: a preview that worked through a special case would tell the
     * trader nothing about whether the alarm will.
     */
    public async unlockAndPlay(toneId: NotificationToneId): Promise<boolean> {
        const ctx = this.context();
        if (!ctx) return false;

        if (ctx.state !== "running") {
            try {
                await ctx.resume();
            } catch (e) {
                logger.warn("market", "[Sound] The platform refused to start audio", e);
            }
        }

        notificationSoundStore.reportAvailability(this.isReady() ? "ready" : "locked");
        return this.play(toneId);
    }

    /** One burst: oscillator into its own gain envelope, both disposable. */
    private schedule(ctx: AudioContext, partial: TonePartial, volume: number): void {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = partial.wave;
        osc.frequency.value = partial.freqHz;

        const start = ctx.currentTime + partial.startMs / 1000;
        const end = start + partial.durationMs / 1000;
        const ramp = RAMP_MS / 1000;
        const peak = partial.peak * volume;

        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(peak, start + ramp);
        gain.gain.setValueAtTime(peak, Math.max(start + ramp, end - ramp));
        gain.gain.linearRampToValueAtTime(0, end);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(end);
        // Nodes are single-use; dropping the references once they have run is
        // what keeps a session that fires hundreds of alarms from holding them.
        osc.onended = () => {
            osc.disconnect();
            gain.disconnect();
        };
    }

    /** How long the given tone takes, for a UI that disables its preview button. */
    public durationMs(toneId: NotificationToneId): number {
        return toneDurationMs(NOTIFICATION_TONES[toneId]);
    }

    /** Test seam: drops the context so the next call builds a fresh one. */
    public reset(): void {
        const ctx = this.ctx;
        this.ctx = null;
        if (!ctx) return;
        try {
            void ctx.close();
        } catch {
            // A context that refuses to close is being discarded anyway.
        }
    }
}

export const soundChannel = new SoundChannel();
