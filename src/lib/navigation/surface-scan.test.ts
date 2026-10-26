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
 * FEAT-0736 — the entry-point registry's source scan.
 *
 * The four audited surfaces now read their destinations from
 * `entry-points.ts`, but the registry tests only exercise the registry. A
 * later edit could reintroduce a literal label, an inline icon, a hardcoded
 * header id or a direct store opener and every existing test would stay
 * green. This scan reads the migrated files and fails on those regressions.
 *
 * The self-test is deliberate: a rule with a regex that can never match is
 * worse than no rule, because it looks like a guard. Every rule carries a
 * sample that the same `violations` helper must flag.
 *
 * The ten-preset journal deep-dive strip, the settings sub-tabs and the
 * journal's main Table/Overview/Deep Dive switch stay host-local and are not
 * scanned; they are not one of the four audited surfaces.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface Rule {
    /** A regression pattern, matched against the raw source. */
    pattern: RegExp;
    /** Why a hit is a regression, printed as the failure message. */
    why: string;
    /** A snippet the rule must flag; keeps the regex from being vacuous. */
    sample: string;
}

interface Surface {
    file: string;
    rules: Rule[];
}

const JOURNAL_TAB_KEYS = [
    "journal.deepDive.performance",
    "journal.deepDive.systemQuality",
    "journal.deepDive.charts.labels.trends",
    "journal.deepDive.behavior",
    "journal.deepDive.charts.labels.fees",
] as const;

const SETTINGS_TAB_KEYS = [
    "settings.tabs.trading",
    "settings.tabs.automation",
    "settings.tabs.chart",
    "settings.tabs.visuals",
    "settings.tabs.ai",
    "settings.tabs.connections",
    "settings.tabs.system",
    "settings.tabs.cloud",
] as const;

function literalKeys(keys: readonly string[]): RegExp {
    const alternatives = keys
        .map((key) => key.replaceAll(".", "\\."))
        .join("|");
    // A trailing boundary keeps `settings.tabs.ai` from flagging the
    // sub-tab key `settings.tabs.ai_assistant`; only exact destination
    // labels are regressions.
    return new RegExp(`(?:${alternatives})(?![A-Za-z0-9_])`);
}

const journalTabLabels = literalKeys(JOURNAL_TAB_KEYS);
const settingsTabLabels = literalKeys(SETTINGS_TAB_KEYS);

const SURFACES: Surface[] = [
    {
        file: "src/components/shared/LeftControlPanel.svelte",
        rules: [
            {
                pattern: /\$_\(\s*["']/,
                why: "the rail's labels come from the registry entry; a literal translation key means a local destination",
                sample: 'label={$_("app.journalButton")}',
            },
            {
                pattern: /\buiState\.toggle\w*\(/,
                why: "opening goes through openEntry; a direct uiState toggle is a local opener",
                sample: "uiState.toggleJournalModal(true)",
            },
            {
                pattern: /\bwindowManager\.(open|toggle|openAcademy|close)\(/,
                why: "opening goes through openEntry; a direct windowManager call is a local opener",
                sample: "windowManager.openAcademy()",
            },
            {
                pattern: /<svg\b/,
                why: "rail icons come from the central icon map, not from inline SVG markup",
                sample: '<svg viewBox="0 0 24 24"></svg>',
            },
        ],
    },
    {
        file: "src/routes/+page.svelte",
        rules: [
            {
                pattern: /app\.journalButton/,
                why: "the header journal label comes from the registry entry",
                sample: 'title={$_("app.journalButton")}',
            },
            {
                pattern: /ViewJournal(Mobile|Desktop)/,
                why: "the header telemetry belongs to HeaderJournalButton, not to the page",
                sample: 'name: "ViewJournalMobile"',
            },
            {
                pattern: /journal-toggle-btn|view-journal-btn-desktop/,
                why: "the stable header ids live in HeaderJournalButton; a local copy is a reintroduced header button",
                sample: 'id="journal-toggle-btn"',
            },
            {
                pattern: /toggleJournalModal\(true\)/,
                why: "opening the journal from the page bypasses openEntry; only the global Escape close remains",
                sample: "uiState.toggleJournalModal(true)",
            },
        ],
    },
    {
        file: "src/components/shared/JournalContent.svelte",
        rules: [
            {
                pattern: journalTabLabels,
                why: "the journal tab labels belong to the registry; a literal key is a local strip",
                sample: 'label: $_("journal.deepDive.performance")',
            },
            {
                pattern: /<DashboardNav\b/,
                why: "the strip is JournalTabStrip; a local DashboardNav is a reintroduced destination list",
                sample: "<DashboardNav {activePreset} {presets} />",
            },
        ],
    },
    {
        file: "src/components/settings/SettingsContent.svelte",
        rules: [
            {
                pattern: settingsTabLabels,
                why: "the settings rail labels belong to the registry; a literal key is a local list",
                sample: 'label: $_("settings.tabs.trading")',
            },
            {
                pattern: /icon:\s*`<path/,
                why: "settings rail icons come from the central icon map, not from inline SVG paths",
                sample: 'icon: `<path d="M0 0h24v24H0z" />`',
            },
            {
                pattern: /<TabBar\b/,
                why: "the rail is SettingsTabBar; TabBar is the presentational primitive, not the surface",
                sample: "<TabBar {tabs} {active} />",
            },
        ],
    },
    {
        file: "src/components/shared/DashboardNav.svelte",
        rules: [
            {
                pattern: journalTabLabels,
                why: "the dumb tab bar owns no default destination list",
                sample: '{ id: "performance", label: $_("journal.deepDive.performance") }',
            },
            {
                pattern: /\bicons\./,
                why: "the tab bar receives icons through its props; importing the icon constants is a local list",
                sample: "icon: icons.chart",
            },
        ],
    },
    {
        file: "src/components/settings/TabBar.svelte",
        rules: [
            {
                pattern: settingsTabLabels,
                why: "the tab bar owns no settings destination list",
                sample: 'label: $_("settings.tabs.trading")',
            },
            {
                pattern: /<path\b/,
                why: "the tab bar renders the icon map's full SVG; inline paths are local icon data",
                sample: '<path d="M0 0h24v24H0z" />',
            },
        ],
    },
    {
        file: "src/components/shared/journal/JournalTabStrip.svelte",
        rules: [
            {
                pattern: journalTabLabels,
                why: "the strip labels come from the registry entries",
                sample: 'label: $_("journal.deepDive.performance")',
            },
            {
                pattern: /<svg\b/,
                why: "the strip icons come from the central icon map",
                sample: '<svg viewBox="0 0 24 24"></svg>',
            },
        ],
    },
    {
        file: "src/components/settings/SettingsTabBar.svelte",
        rules: [
            {
                pattern: settingsTabLabels,
                why: "the rail labels come from the registry entries; the group aria-label is not a destination",
                sample: 'label: $_("settings.tabs.trading")',
            },
            {
                pattern: /<svg\b/,
                why: "the rail icons come from the central icon map",
                sample: '<svg viewBox="0 0 24 24"></svg>',
            },
        ],
    },
    {
        file: "src/components/shared/HeaderJournalButton.svelte",
        rules: [
            {
                pattern: /app\.journalButton/,
                why: "the header label and title come from the registry entry",
                sample: 'title={$_("app.journalButton")}',
            },
            {
                pattern: /\b(uiState|windowManager)\./,
                why: "the header opens the journal through openEntry, not through a store",
                sample: "uiState.toggleJournalModal(true)",
            },
        ],
    },
];

/** Returns the rules whose pattern appears in the source. */
function violations(source: string, rules: Rule[]): Rule[] {
    return rules.filter((rule) => rule.pattern.test(source));
}

describe("FEAT-0736: the entry-point registry source scan", () => {
    it("guards the four migrated surfaces and the two registry views", () => {
        expect(SURFACES.map((surface) => surface.file).sort()).toEqual(
            [
                "src/components/settings/SettingsContent.svelte",
                "src/components/settings/SettingsTabBar.svelte",
                "src/components/settings/TabBar.svelte",
                "src/components/shared/DashboardNav.svelte",
                "src/components/shared/HeaderJournalButton.svelte",
                "src/components/shared/JournalContent.svelte",
                "src/components/shared/LeftControlPanel.svelte",
                "src/components/shared/journal/JournalTabStrip.svelte",
                "src/routes/+page.svelte",
            ].sort(),
        );
    });

    it("keeps the migrated surfaces free of local destination data", () => {
        for (const surface of SURFACES) {
            const source = readFileSync(surface.file, "utf8");
            expect(
                violations(source, surface.rules).map(
                    (rule) => `${surface.file}: ${rule.why}`,
                ),
            ).toEqual([]);
        }
    });

    it("flags every rule's sample, so no rule is vacuous", () => {
        for (const surface of SURFACES) {
            for (const rule of surface.rules) {
                expect(
                    violations(rule.sample, [rule]).map(
                        () => `${surface.file}: ${rule.why}`,
                    ),
                ).toEqual([`${surface.file}: ${rule.why}`]);
            }
        }
    });
});
