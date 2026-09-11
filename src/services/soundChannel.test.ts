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
 * Every test here is about a refusal. The channel's job is not to make noise —
 * a speaker does that — it is to be honest about whether noise happened, so
 * that `notificationService` can report delivery instead of assuming it and the
 * settings UI can show "not yet" instead of "on".
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("./logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { soundChannel } from "./soundChannel.svelte";
import { notificationSoundStore } from "../stores/notificationSound.svelte";
import { NOTIFICATION_TONES } from "../lib/notificationTones";

interface FakeOscillator {
    type: string;
    frequency: { value: number };
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
}

/** Records what was scheduled, so a test can count bursts instead of listening. */
class FakeAudioContext {
    public static instances: FakeAudioContext[] = [];
    public static throwOnConstruct = false;
    /** What state the next context is born in — the autoplay lever. */
    public static nextState: AudioContextState = "running";

    public state: AudioContextState = FakeAudioContext.nextState;
    public currentTime = 0;
    public destination = {} as AudioDestinationNode;
    public oscillators: FakeOscillator[] = [];
    public resume = vi.fn(async () => {
        this.state = "running";
    });
    public close = vi.fn(async () => {});

    constructor() {
        if (FakeAudioContext.throwOnConstruct) throw new Error("refused");
        this.state = FakeAudioContext.nextState;
        FakeAudioContext.instances.push(this);
    }

    public createOscillator(): FakeOscillator {
        const osc: FakeOscillator = {
            type: "",
            frequency: { value: 0 },
            start: vi.fn(),
            stop: vi.fn(),
            connect: vi.fn(),
            disconnect: vi.fn(),
            onended: null,
        };
        this.oscillators.push(osc);
        return osc;
    }

    public createGain() {
        return {
            gain: {
                setValueAtTime: vi.fn(),
                linearRampToValueAtTime: vi.fn(),
            },
            connect: vi.fn(),
            disconnect: vi.fn(),
        };
    }
}

type AudioScope = { AudioContext?: unknown; webkitAudioContext?: unknown };

/**
 * Installs the fake API. The context itself is built lazily on the first play,
 * so the state it will be born in is chosen here rather than returned.
 */
function installAudio(state: AudioContextState = "running"): void {
    FakeAudioContext.instances = [];
    FakeAudioContext.throwOnConstruct = false;
    FakeAudioContext.nextState = state;
    (globalThis as AudioScope).AudioContext = FakeAudioContext;
}

beforeEach(() => {
    vi.clearAllMocks();
    soundChannel.reset();
    notificationSoundStore.reload();
    FakeAudioContext.instances = [];
    FakeAudioContext.nextState = "running";
    FakeAudioContext.throwOnConstruct = false;
    delete (globalThis as AudioScope).AudioContext;
    delete (globalThis as AudioScope).webkitAudioContext;
});

afterEach(() => {
    delete (globalThis as AudioScope).AudioContext;
    delete (globalThis as AudioScope).webkitAudioContext;
});

/** The constructed context, after a play attempt has forced it into being. */
function created(): FakeAudioContext {
    const ctx = FakeAudioContext.instances[0];
    expect(ctx).toBeDefined();
    return ctx;
}

describe("a tone that is heard", () => {
    beforeEach(() => {
        installAudio();
    });

    it("reports delivery and schedules one burst per partial", () => {
        const played = soundChannel.play("alarm");

        expect(played).toBe(true);
        expect(created().oscillators).toHaveLength(NOTIFICATION_TONES.alarm.partials.length);
        expect(notificationSoundStore.availability).toBe("ready");
    });

    it("gives the three tones different shapes, so they can be told apart", () => {
        // The criterion is "distinguishable from each other". Pitch alone would
        // pass a test and fail a trader on a laptop speaker, so the tones differ
        // in rhythm too — which is what a burst count measures.
        const shapes = (["chime", "alarm", "error"] as const).map((id) =>
            NOTIFICATION_TONES[id].partials.map((p) => `${p.wave}@${p.freqHz}`).join("|"),
        );

        expect(new Set(shapes).size).toBe(3);
        expect(NOTIFICATION_TONES.alarm.partials).toHaveLength(3);
    });

    it("scales the peak gain by the chosen volume", () => {
        notificationSoundStore.setVolume(0.5);

        expect(soundChannel.play("chime")).toBe(true);
        expect(notificationSoundStore.effectiveVolume).toBe(0.5);
    });
});

describe("a tone that is refused", () => {
    it("reports the channel as locked when audio has not been allowed yet", async () => {
        installAudio("suspended");

        const played = soundChannel.play("alarm");

        expect(played).toBe(false);
        expect(notificationSoundStore.availability).toBe("locked");
        // Asked anyway: if a gesture has happened since the context was built,
        // the resume lands and the *next* alarm is heard.
        expect(created().resume).toHaveBeenCalled();
    });

    it("does not throw when the browser has no audio API at all", () => {
        // Nothing installed: `AudioContext` is undefined, as in a JSDOM run or a
        // locked-down browser.
        expect(() => soundChannel.play("alarm")).not.toThrow();
        expect(soundChannel.play("alarm")).toBe(false);
        expect(FakeAudioContext.instances).toHaveLength(0);
        expect(notificationSoundStore.availability).toBe("unsupported");
    });

    it("treats a platform that refuses a context as unsupported", () => {
        installAudio();
        FakeAudioContext.throwOnConstruct = true;

        expect(soundChannel.play("alarm")).toBe(false);
        expect(notificationSoundStore.availability).toBe("unsupported");
    });

    it("stays silent while muted, and says so", () => {
        installAudio();
        notificationSoundStore.setMuted(true);

        expect(soundChannel.play("alarm")).toBe(false);
        expect(notificationSoundStore.availability).toBe("muted");
        // No context was built: mute is answered before the platform is asked.
        expect(FakeAudioContext.instances).toHaveLength(0);
    });

    it("keeps the chosen volume across a mute and an unmute", () => {
        installAudio();
        notificationSoundStore.setVolume(0.25);
        notificationSoundStore.setMuted(true);
        expect(notificationSoundStore.effectiveVolume).toBe(0);

        notificationSoundStore.setMuted(false);
        expect(notificationSoundStore.volume).toBe(0.25);
        expect(notificationSoundStore.effectiveVolume).toBe(0.25);
    });
});

describe("the preview button", () => {
    it("starts audio from inside the gesture and then plays", async () => {
        installAudio("suspended");

        const played = await soundChannel.unlockAndPlay("alarm");

        expect(created().resume).toHaveBeenCalled();
        expect(played).toBe(true);
        expect(notificationSoundStore.availability).toBe("ready");
    });
});
