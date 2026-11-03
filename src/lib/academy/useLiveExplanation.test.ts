// @vitest-environment jsdom
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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * FEAT-0678 — cancellation and one-at-a-time.
 *
 * The component test covers what a reader sees; this one covers the two
 * promises the component delegates: a second press does not start a second
 * request, and a cancelled request is never reported as a failure.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ askOnce: vi.fn() }));

vi.mock("../../stores/ai.svelte", () => ({
    aiState: { askOnce: mocks.askOnce },
}));

import { LiveExplanationState } from "./useLiveExplanation.svelte";
import type { CatalogueEntry } from "../alerts/indicatorCatalogue";
import type { LessonSeries } from "./indicatorLessonSeries";

const entry = {
    id: "rsi",
    group: "oscillators",
    params: [],
    outputs: [{ name: "value", dimension: "oscillator" }],
    placement: "pane",
} as unknown as CatalogueEntry;

const series: LessonSeries = {
    lines: [{ name: "value", values: ["61.2"] }],
    refused: [],
};

const request = {
    entry,
    params: {},
    field: "close" as const,
    symbol: "BTCUSDT",
    timeframe: "1h",
    series,
    locale: "en" as const,
};

describe("LiveExplanationState (FEAT-0678)", () => {
    beforeEach(() => {
        mocks.askOnce.mockReset();
    });

    it("ignores a second press while an answer streams", async () => {
        let release: (value: unknown) => void = () => {};
        mocks.askOnce.mockImplementation(
            () => new Promise((resolve) => (release = resolve)),
        );
        const live = new LiveExplanationState();

        const first = live.ask(request);
        expect(live.status).toBe("streaming");
        const second = live.ask(request);
        await second;

        expect(mocks.askOnce).toHaveBeenCalledTimes(1);

        release({ content: "", usage: {}, toolCallBuffer: "" });
        await first;
        expect(live.status).toBe("done");
    });

    it("aborts a running request on reset and returns to idle", async () => {
        let captured: AbortSignal | undefined;
        mocks.askOnce.mockImplementation(
            (_messages, options: { signal?: AbortSignal; onDelta?: (c: string) => void }) => {
                captured = options.signal;
                options.onDelta?.("half an ans");
                return new Promise(() => {
                    // Never settles: reset() is what ends it.
                });
            },
        );
        const live = new LiveExplanationState();

        void live.ask(request);
        expect(live.text).toBe("half an ans");

        live.reset();

        expect(captured?.aborted).toBe(true);
        expect(live.status).toBe("idle");
        expect(live.text).toBe("");
        expect(live.error).toBeNull();
    });

    it("does not report a cancellation as a failure", async () => {
        mocks.askOnce.mockRejectedValue(
            new DOMException("The operation was aborted.", "AbortError"),
        );
        const live = new LiveExplanationState();

        await live.ask(request);

        expect(live.status).toBe("idle");
        expect(live.error).toBeNull();
    });

    it("reports a provider failure with its message", async () => {
        mocks.askOnce.mockRejectedValue(new Error("HTTP 401: bad key"));
        const live = new LiveExplanationState();

        await live.ask(request);

        expect(live.status).toBe("error");
        expect(live.error).toBe("HTTP 401: bad key");
    });
});
