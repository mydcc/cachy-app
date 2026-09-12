// @vitest-environment happy-dom
/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
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
 * FEAT-0395 — the indicator entry point, as a trader meets it.
 *
 * The mapping has its own test against the core; this covers the half that
 * only exists in the DOM: that the action appears exactly on the cards that
 * can be armed, that it is reachable without a mouse, and that pressing it
 * opens a *draft* rather than arming anything.
 */

import { mount, unmount, flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import IndicatorAlertAction from "./IndicatorAlertAction.svelte";
import de from "../../../locales/locales/de.json";
import en from "../../../locales/locales/en.json";
import { alertPanelState } from "../../../stores/alertPanel.svelte";
import { indicatorState } from "../../../stores/indicator.svelte";
import { tradeState } from "../../../stores/trade.svelte";
import { uiState } from "../../../stores/ui.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

const settle = () => flushSync();

/**
 * The condition the seed put in the draft.
 *
 * A draft always holds a group, even for one condition -- the shape FEAT-0030
 * needed and the reason the seed path did not have to change for it.
 */
function seededCondition(): unknown {
    const conditions = alertPanelState.draft.conditions as {
        kind: string;
        of: unknown[];
    };
    expect(conditions.kind).toBe("group");
    expect(conditions.of).toHaveLength(1);
    return conditions.of[0];
}

function render(settingsKey: string): HTMLButtonElement | null {
    component = mount(IndicatorAlertAction, {
        target: host,
        props: { settingsKey },
    }) as never;
    settle();
    return host.querySelector("button");
}

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    uiState.toggleAlertsModal(false);
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
    uiState.toggleAlertsModal(false);
});

describe("which cards offer the action", () => {
    it("offers it on a card the rule core can express", () => {
        expect(render("rsi")).not.toBeNull();
    });

    it("renders nothing on a card the core cannot express", () => {
        // Pivots have no registry identity, so an action here would open the
        // panel onto an indicator the builder cannot show.
        expect(render("pivots")).toBeNull();
        expect(host.textContent?.trim()).toBe("");
    });
});

describe("reaching the action without a mouse", () => {
    it("is a real button, so it is tabbable and Enter activates it", () => {
        const button = render("rsi")!;
        expect(button.tagName).toBe("BUTTON");
        expect(button.type).toBe("button");
        // No tabindex needed on a native button, and a negative one would
        // take it out of the tab order — assert it was not added.
        expect(button.getAttribute("tabindex")).toBeNull();
        expect(button.disabled).toBe(false);
    });

    it("carries an accessible name, since the control is icon-only", () => {
        const button = render("rsi")!;
        const name = button.getAttribute("aria-label");
        expect(name).toBe(en.settings.technicals.alertOnThis);
        expect(name?.trim()).not.toBe("");
        // The icon must not be announced twice.
        expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    });

    it("has the label in both shipped locales", () => {
        // New UI strings go into both dictionaries. A key present in only one
        // renders as the raw `settings.technicals.alertOnThis` for the other
        // half of the users.
        expect(en.settings.technicals.alertOnThis.trim()).not.toBe("");
        expect(de.settings.technicals.alertOnThis.trim()).not.toBe("");
        expect(de.settings.technicals.alertOnThis).not.toBe(
            en.settings.technicals.alertOnThis,
        );
    });
});

describe("what pressing it does", () => {
    it("opens the Indicators tab on a draft carrying the configured period", () => {
        indicatorState.rsi.length = 21;
        tradeState.symbol = "ETHUSDT";

        render("rsi")!.click();
        settle();

        expect(uiState.showAlertsModal).toBe(true);
        expect(alertPanelState.activeTab).toBe("indicators");
        expect(alertPanelState.draft.symbol).toBe("ETHUSDT");
        expect(seededCondition()).toMatchObject({
            kind: "compare",
            left: {
                kind: "indicator",
                // 21, not the registry's 14: the parameters on screen are the
                // ones the trader means.
                indicator: { id: "rsi", params: { period: 21 } },
            },
        });
    });

    it("leaves the threshold at zero for the trader to fill in", () => {
        render("rsi")!.click();
        settle();

        expect(seededCondition()).toMatchObject({
            op: "gt",
            right: { kind: "constant", value: "0" },
        });
    });

    it("does not arm: it opens the panel that asks for confirmation", () => {
        render("rsi")!.click();
        settle();

        // The draft is waiting to be consumed by the panel, which still shows
        // the sentence and still has its own arm press (ADR-0012 decision 5).
        expect(uiState.showAlertsModal).toBe(true);
        expect(alertPanelState.seedPending).toBe(true);
    });
});
