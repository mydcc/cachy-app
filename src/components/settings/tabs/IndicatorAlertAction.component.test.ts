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

/**
 * The chart draws the card's line over its source. Since FEAT-0454 an alert
 * names that price wherever the indicator takes one, so the card arms. Where it
 * takes none (stoch RSI) the alert is computed over the close, and a card drawn
 * over anything else keeps BUG-0453's answer: hiding the button would leave the
 * trader wondering where it went, so it stays, refuses, and says which price to
 * choose.
 */
describe("a card drawn over a price source", () => {
    const reason = (source: string) =>
        en.settings.technicals.alertSourceMismatch.replaceAll("{source}", source);
    /** Stoch RSI's source is fixed to the close, so only a hand-edited store holds another. */
    const stochRsiCard = indicatorState.stochRsi as unknown as { source: string };

    afterEach(() => {
        indicatorState.rsi.source = "close";
        indicatorState.cci.source = "hlc3";
        stochRsiCard.source = "close";
    });

    // FEAT-0454: the alert names the card's price, so the card no longer refuses.
    it("arms an RSI card drawn over hl2, and seeds RSI over hl2", () => {
        indicatorState.rsi.source = "hl2";
        const button = render("rsi")!;

        expect(button.getAttribute("aria-disabled")).not.toBe("true");
        expect(button.getAttribute("aria-label")).toBe(en.settings.technicals.alertOnThis);

        button.click();
        settle();
        expect(uiState.showAlertsModal).toBe(true);
        expect(seededCondition()).toMatchObject({
            left: { kind: "indicator", indicator: { id: "rsi", field: "hl2" } },
        });
    });

    it("arms a CCI card set to the close, and seeds CCI over the close", () => {
        indicatorState.cci.source = "close";
        const button = render("cci")!;

        expect(button.getAttribute("aria-disabled")).not.toBe("true");
        button.click();
        settle();
        expect(seededCondition()).toMatchObject({
            left: { kind: "indicator", indicator: { id: "cci", field: "close" } },
        });
    });

    it("arms a CCI card on its default typical price", () => {
        const button = render("cci")!;

        expect(button.getAttribute("aria-disabled")).not.toBe("true");
        expect(button.getAttribute("aria-label")).toBe(en.settings.technicals.alertOnThis);
    });

    it("keeps the action visible on a stoch RSI card drawn over another price, refuses it, and names the close", () => {
        stochRsiCard.source = "hl2";
        const button = render("stochRsi")!;

        expect(button).not.toBeNull();
        expect(button.getAttribute("aria-disabled")).toBe("true");
        expect(button.getAttribute("aria-label")).toBe(reason("close"));
        expect(button.getAttribute("title")).toBe(reason("close"));
        // Still a focusable native button, so a keyboard user can reach the reason.
        expect(button.disabled).toBe(false);
    });

    it("does not open the panel when a refused card is pressed", () => {
        stochRsiCard.source = "hlc3";
        render("stochRsi")!.click();
        settle();

        expect(uiState.showAlertsModal).toBe(false);
    });

    it("becomes armable again as soon as the source is set back to the close", () => {
        stochRsiCard.source = "hl2";
        const button = render("stochRsi")!;
        stochRsiCard.source = "close";
        settle();

        expect(button.getAttribute("aria-disabled")).not.toBe("true");
        expect(button.getAttribute("aria-label")).toBe(en.settings.technicals.alertOnThis);
    });

    it("has the reason, with its placeholder, in both shipped locales", () => {
        expect(en.settings.technicals.alertSourceMismatch).toContain("{source}");
        expect(de.settings.technicals.alertSourceMismatch).toContain("{source}");
        expect(de.settings.technicals.alertSourceMismatch).not.toBe(
            en.settings.technicals.alertSourceMismatch,
        );
    });
});

describe("an ADX card whose two lengths differ", () => {
    afterEach(() => {
        indicatorState.adx.diLength = 14;
        indicatorState.adx.adxSmoothing = 14;
    });

    it("keeps the action visible but refuses it, and names the settings to align", () => {
        indicatorState.adx.diLength = 10;
        const button = render("adx")!;

        expect(button).not.toBeNull();
        expect(button.getAttribute("aria-disabled")).toBe("true");
        expect(button.getAttribute("aria-label")).toBe(en.settings.technicals.alertAdxLengthMismatch);
        button.click();
        settle();
        expect(uiState.showAlertsModal).toBe(false);
    });

    it("arms the card once both lengths are the same", () => {
        indicatorState.adx.diLength = 10;
        const button = render("adx")!;
        indicatorState.adx.adxSmoothing = 10;
        settle();

        expect(button.getAttribute("aria-disabled")).not.toBe("true");
        expect(button.getAttribute("aria-label")).toBe(en.settings.technicals.alertOnThis);
    });

    it("has the reason in both shipped locales", () => {
        expect(en.settings.technicals.alertAdxLengthMismatch).toBeTruthy();
        expect(de.settings.technicals.alertAdxLengthMismatch).toBeTruthy();
        expect(de.settings.technicals.alertAdxLengthMismatch).not.toBe(
            en.settings.technicals.alertAdxLengthMismatch,
        );
    });
});

/**
 * FEAT-0446 group 4. Alerts read the Ichimoku cloud displaced by 26 candles; a
 * card displaced by another number draws a cloud no alert reads.
 */
describe("an Ichimoku card displaced by another number of candles", () => {
    const reason = en.settings.technicals.alertIchimokuDisplacementMismatch.replaceAll("{displacement}", "26");

    afterEach(() => {
        indicatorState.ichimoku.displacement = 26;
    });

    it("keeps the action visible but refuses it, and names the displacement to set", () => {
        indicatorState.ichimoku.displacement = 30;
        const button = render("ichimoku")!;

        expect(button).not.toBeNull();
        expect(button.getAttribute("aria-disabled")).toBe("true");
        expect(button.getAttribute("aria-label")).toBe(reason);
        button.click();
        settle();
        expect(uiState.showAlertsModal).toBe(false);
    });

    it("arms the card once it is displaced by 26 again", () => {
        indicatorState.ichimoku.displacement = 30;
        const button = render("ichimoku")!;
        indicatorState.ichimoku.displacement = 26;
        settle();

        expect(button.getAttribute("aria-disabled")).not.toBe("true");
        expect(button.getAttribute("aria-label")).toBe(en.settings.technicals.alertOnThis);
    });

    it("has the reason, with its placeholder, in both shipped locales", () => {
        expect(en.settings.technicals.alertIchimokuDisplacementMismatch).toContain("{displacement}");
        expect(de.settings.technicals.alertIchimokuDisplacementMismatch).toContain("{displacement}");
        expect(de.settings.technicals.alertIchimokuDisplacementMismatch).not.toBe(
            en.settings.technicals.alertIchimokuDisplacementMismatch,
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
