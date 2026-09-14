// @vitest-environment happy-dom
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
 */

/*
 * FEAT-0346 — AiModelPicker loads the provider's model list and lets the user
 * pick one. It debounces the key-driven reload, keeps the saved model when the
 * provider no longer lists it (instead of silently switching), and reports a
 * failed key as text rather than an empty dropdown.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../locales/locales/en.json";

function lookup(key: string): string {
    return key
        .split(".")
        .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], en) as string;
}

vi.mock("../../locales/i18n", async () => {
    const { readable } = await import("svelte/store");
    return { _: readable((key: string) => lookup(key) ?? key), locale: readable("en"), setLocale: vi.fn() };
});

const { getModels } = vi.hoisted(() => ({ getModels: vi.fn() }));
vi.mock("../../services/aiModelsService", () => ({ getModels }));

vi.mock("../../stores/settings/aiProviders", () => ({
    isFreeModelId: (id: string) => id === "free-model",
}));

import AiModelPicker from "./AiModelPicker.svelte";

const MODELS = [
    { id: "gpt-4o", label: "GPT-4o", contextWindow: 128000, inputPrice: 2.5 },
    { id: "free-model", label: "Free Tier" },
];

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    getModels.mockResolvedValue({ models: MODELS });
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    vi.useRealTimers();
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

async function render(props: Record<string, unknown> = {}) {
    component = mount(AiModelPicker, {
        target: host,
        props: { provider: "openai", apiKey: "sk-test", model: "gpt-4o", ...props },
    }) as never;
    await vi.advanceTimersByTimeAsync(600);
    flushSync();
}

describe("FEAT-0346 — AiModelPicker loads and reports the model list", () => {
    it("fetches after the debounce and offers a select", async () => {
        await render();

        expect(getModels).toHaveBeenCalledWith(
            "openai",
            { apiKey: "sk-test", baseUrl: "" },
            { forceRefresh: false },
        );
        const select = host.querySelector("select");
        expect(select).toBeTruthy();
        expect(select?.querySelector('option[value="gpt-4o"]')?.textContent).toContain("GPT-4o");
    });

    it("reports a successful connection once models arrive", async () => {
        await render();

        expect(host.textContent).toContain(lookup("settings.ai.model.connectionOk"));
    });

    it("shows the failure reason instead of an empty dropdown", async () => {
        getModels.mockRejectedValueOnce(new Error("401 invalid key"));
        await render();

        expect(host.textContent).toContain("401 invalid key");
        expect(host.querySelector("select")).toBeNull();
    });

    it("warns when the saved model is no longer listed", async () => {
        await render({ model: "legacy-model" });

        expect(host.textContent).toContain(lookup("settings.ai.model.notInList"));
    });

    it("marks a free model as free in its label", async () => {
        await render();

        expect(host.textContent).toContain(lookup("settings.ai.model.free"));
    });
});
