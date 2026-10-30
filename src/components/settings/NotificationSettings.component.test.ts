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

/**
 * BUG-0753 — the matrix must not claim a channel delivery will skip.
 *
 * Two states look alike in the old UI: "credentials missing" and "credentials
 * fine, switch off". They are fixed in different places, so the cell names
 * both, and neither is operable.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import en from "../../locales/locales/en.json";
import NotificationSettings from "./NotificationSettings.svelte";
import { externalChannelsStore } from "../../stores/externalChannels.svelte";
import { notificationPolicyStore } from "../../stores/notifications.svelte";

const dictionary = en as Record<string, unknown>;

function getNestedTranslation(path: string): string {
    let current: unknown = dictionary;
    for (const part of path.split(".")) {
        if (!current || typeof current !== "object") return path;
        current = (current as Record<string, unknown>)[part];
    }
    return typeof current === "string" ? current : path;
}

vi.mock("../../locales/i18n", async () => {
    const { writable } = await import("svelte/store");
    return {
        _: writable((key: string) => getNestedTranslation(key)),
        locale: writable("en"),
    };
});

describe("BUG-0753: the notification matrix gate", () => {
    let target: HTMLElement;
    let component: ReturnType<typeof mount> | null = null;

    beforeEach(() => {
        target = document.createElement("div");
        document.body.appendChild(target);
        notificationPolicyStore.reset();
        externalChannelsStore.reload();
        component = mount(NotificationSettings, { target });
        flushSync();
    });

    afterEach(() => {
        if (component) unmount(component);
        component = null;
        target.remove();
    });

    function cell(channel: string): HTMLInputElement {
        const input = target.querySelector<HTMLInputElement>(`#notify-alert-fired-${channel}`);
        if (!input) throw new Error(`no matrix cell for ${channel}`);
        return input;
    }

    function titleOf(channel: string): string | null {
        return cell(channel).closest("[title]")?.getAttribute("title") ?? null;
    }

    it("blocks a paused channel and says which switch to flip", () => {
        externalChannelsStore.setDiscord({
            enabled: false,
            webhookUrl: "https://discord.com/api/webhooks/123456789/abcdefQWERTY-_",
            format: "minimal",
        });
        flushSync();

        expect(cell("discord").disabled).toBe(true);
        expect(titleOf("discord")).toBe(
            "Channel paused — switch it on in External channels below",
        );
    });

    it("distinguishes missing credentials from a paused channel", () => {
        flushSync();

        expect(cell("telegram").disabled).toBe(true);
        expect(titleOf("telegram")).toBe("Set this up below first");
    });

    it("leaves a configured, enabled channel operable", () => {
        externalChannelsStore.setDiscord({
            enabled: true,
            webhookUrl: "https://discord.com/api/webhooks/123456789/abcdefQWERTY-_",
            format: "minimal",
        });
        flushSync();

        expect(cell("discord").disabled).toBe(false);
        expect(titleOf("discord")).toBeNull();
    });
});
