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
 * ProviderCard shows the vendor's key-creation page next to the API-key field,
 * and shows nothing at all when the vendor publishes no such page.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../locales/locales/en.json";

const { provider } = vi.hoisted(() => ({
    provider: {
        id: "builtin-openai",
        label: "OpenAI",
        flavor: "openai-chat",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o",
        apiKey: "sk-test",
        allowServerRelay: true,
    },
}));

vi.mock("../../locales/i18n", async () => {
    const { readable } = await import("svelte/store");
    const lookup = (key: string): string =>
        key
            .split(".")
            .reduce<unknown>(
                (acc, part) => (acc as Record<string, unknown>)?.[part],
                en,
            ) as string;
    return {
        _: readable((key: string) => lookup(key) ?? key),
        locale: readable("en"),
        setLocale: vi.fn(),
    };
});

const { getModels } = vi.hoisted(() => ({ getModels: vi.fn() }));
vi.mock("../../services/aiModelsService", () => ({ getModels }));

vi.mock("../../stores/settings.svelte", () => ({
    settingsState: { userProviders: [provider] },
}));

import ProviderCard from "./ProviderCard.svelte";

const KEY_URL = "https://platform.openai.com/api-keys";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    getModels.mockResolvedValue({ models: [], fromCache: false });
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
    component = mount(ProviderCard, {
        target: host,
        props: {
            entryId: "builtin-openai",
            vendor: "openai",
            keyLabel: "OpenAI API Key",
            apiKeyUrl: KEY_URL,
            apiKeyUrlLabel: "Create API key",
            ...props,
        },
    }) as never;
    await vi.advanceTimersByTimeAsync(600);
    flushSync();
}

describe("ProviderCard links to the vendor's key page", () => {
    it("renders the link with the given target and noopener", async () => {
        await render();

        const link = host.querySelector<HTMLAnchorElement>(
            `a[href="${KEY_URL}"]`,
        );
        expect(link).toBeTruthy();
        expect(link?.target).toBe("_blank");
        expect(link?.rel).toContain("noopener");
        expect(link?.referrerPolicy).toBe("no-referrer");
        expect(link?.textContent).toContain("Create API key");
    });

    it("renders no link when the target is not an http(s) URL", async () => {
        await render({ apiKeyUrl: "javascript:alert(1)" });

        expect(host.querySelector("a[href]")).toBeNull();
    });

    it("renders no link when the vendor has no key page", async () => {
        await render({ apiKeyUrl: "", apiKeyUrlLabel: "" });

        expect(host.querySelector("a[href]")).toBeNull();
    });

    it("still shows the link for a provider without an API-key field", async () => {
        await render({ showApiKey: false });

        expect(host.querySelector("#builtin-openai-key")).toBeNull();
        expect(host.querySelector(`a[href="${KEY_URL}"]`)).toBeTruthy();
    });
});
