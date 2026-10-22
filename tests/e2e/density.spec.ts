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

/*
 * FEAT-0614 — the density baseline.
 *
 * The acceptance criterion is visual: `default` must render exactly like the
 * build before the setting existed, and `compact`/`wide` must move control
 * height, control font size, section padding and section gap together.
 *
 * Only the settings window is captured. The calculator and the journal were
 * tried and dropped: both render a live mark price, so their screenshots
 * compare the exchange feed, not the density (observed: BTCUSDT at 81622.7 in
 * one run, a different price in the next). Their geometry is covered by
 * `src/themes.density.test.ts` (computed `.input-field` height per mode) and by
 * the shared tokens themselves.
 *
 * Determinism: every external request is aborted, and the disclaimer is
 * pre-accepted, so the modal cannot cover the surface. Each case seeds the
 * settings blob before the app loads — also the path a returning user takes.
 *
 * Playwright is a local gate — no CI workflow runs it. Generate or accept the
 * baselines with `npx playwright test tests/e2e/density.spec.ts
 * --update-snapshots` on the machine that will also run the gate.
 */

import { test, expect } from "@playwright/test";

const MODES = ["compact", "default", "wide"] as const;

async function openSettings(
    page: import("@playwright/test").Page,
    density: (typeof MODES)[number],
): Promise<void> {
    await page.addInitScript((mode) => {
        const key = "cryptoCalculatorSettings";
        // This script runs on every document load, including the reload the
        // persistence case performs. Seeding unconditionally would reset the
        // blob it just wrote and make the test measure itself.
        if (!localStorage.getItem(key)) {
            localStorage.setItem(
                key,
                JSON.stringify({ density: mode, disclaimerAccepted: true }),
            );
        }
        // The capability toast fires once per device and sits outside the
        // window; suppress it so the capture is the window, not the toast.
        localStorage.setItem("cachy_performance_warning_shown", "true");
    }, density);

    // No exchange sockets, no CDN fonts, no news feeds: the run has to look the
    // same tomorrow.
    await page.route("**/*", (route) => {
        const target = route.request().url();
        return target.startsWith("http://localhost:4173")
            ? route.continue()
            : route.abort();
    });

    await page.goto("/?action=settings");
    await page.waitForSelector(`html[data-density="${density}"]`);
    await page.waitForTimeout(400);
}

for (const mode of MODES) {
    test(`settings window renders in ${mode} density`, async ({ page }) => {
        await openSettings(page, mode);

        // The window, not the page: the market sidebar renders a live price,
        // and a full-page capture would compare the exchange feed.
        await expect(page.locator(".window-frame").first()).toHaveScreenshot(
            `settings-${mode}.png`,
            {
                animations: "disabled",
                maxDiffPixelRatio: 0.01,
            },
        );
    });
}

test("a chosen density survives a reload", async ({ page }) => {
    await openSettings(page, "default");

    // The control lives where FEAT-0607 put it: Visuals → Layout.
    await page.getByRole("tab", { name: /Visuals|Darstellung/ }).click();
    await page.getByRole("tab", { name: /^Layout$/ }).click();

    await page.locator("#density-mode").selectOption("compact");
    await expect(page.locator("html")).toHaveAttribute(
        "data-density",
        "compact",
    );

    // The store saves through an effect; reload only once the blob carries it,
    // otherwise the test measures the debounce instead of the persistence.
    await expect
        .poll(
            () =>
                page.evaluate(() =>
                    (localStorage.getItem("cryptoCalculatorSettings") ?? "").includes(
                        '"density":"compact"',
                    ),
                ),
            { timeout: 10_000 },
        )
        .toBe(true);

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute(
        "data-density",
        "compact",
    );
});
