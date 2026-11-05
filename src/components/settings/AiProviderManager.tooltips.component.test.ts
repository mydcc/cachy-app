// @vitest-environment happy-dom
/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option) any
 * later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more
 * details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * FEAT-0802 — where the AI provider copy lives.
 *
 * The section intro is a pure explanation and sits entirely behind the marker.
 * The relay switch is different: it decides whether prompts and the API key go
 * straight to the provider or through Cachy, so a visible one-liner keeps the
 * direction of the flow readable without hovering.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import en from "../../locales/locales/en.json";

vi.mock("../../locales/i18n", async () => {
  const { readable } = await import("svelte/store");
  const translate = (key: string) => {
    let value: unknown = en;
    for (const part of key.split(".")) {
      value = (value as Record<string, unknown>)?.[part];
    }
    return typeof value === "string" ? value : key;
  };
  return { _: readable(translate), locale: readable("en") };
});

const settingsMock = vi.hoisted(() => ({
  showTooltips: true,
  activeProviderId: "",
  userProviders: [] as Array<Record<string, unknown>>,
}));
vi.mock("../../stores/settings.svelte", () => ({ settingsState: settingsMock }));
vi.mock("./AiModelPicker.svelte", async () => ({
  default: (await import("../../tests/helpers/EmptySvelteComponent.svelte")).default,
}));

import AiProviderManager from "./AiProviderManager.svelte";

function translation(key: string): string {
  return key
    .split(".")
    .reduce<unknown>((value, part) => (value as Record<string, unknown>)?.[part], en) as string;
}

let host: HTMLElement;
let component: ReturnType<typeof mount> | null = null;

beforeEach(() => {
  settingsMock.activeProviderId = "";
  settingsMock.userProviders = [];
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  if (component) unmount(component);
  component = null;
  host.remove();
});

function render(): void {
  component = mount(AiProviderManager, { target: host });
  flushSync();
}

describe("AI provider help text (FEAT-0802)", () => {
  it("carries the section intro in the marker, not as a paragraph", () => {
    render();

    expect(host.textContent).not.toContain(
      translation("settings.ai.customProviders.desc"),
    );
    expect(host.querySelector(".info-tip")).not.toBeNull();
  });

  it("keeps the relay direction visible and the details in the marker", () => {
    settingsMock.userProviders = [
      {
        id: "custom-1",
        label: "Mine",
        flavor: "openai-chat",
        baseUrl: "http://localhost:8000/v1",
        apiKey: "",
        model: "",
        allowServerRelay: false,
      },
    ];
    render();

    expect(host.textContent).not.toContain(
      translation("settings.ai.customProviders.relayDesc"),
    );
    expect(host.textContent).toContain(
      translation("settings.ai.customProviders.relayNote"),
    );
  });
});
