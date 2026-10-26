# FEAT-0618 — Entry-point registry contract

Status: specification only. No UI is migrated by this item; implementation is a
follow-up. This document defines the data and the contract, not a component.

## Why

Four surfaces currently each know how to open a destination:

| Surface | File | Today |
| --- | --- | --- |
| Floating left rail | `src/components/shared/LeftControlPanel.svelte` | hardcoded button list and open calls |
| Main header cluster | `src/routes/+page.svelte` | presets, theme, reset and journal in one flex row |
| Journal tab strip | `src/components/shared/DashboardNav.svelte` | five deep-dive presets |
| Settings rail | `src/components/settings/SettingsContent.svelte` | eight tabs and their labels/icons |

Adding a destination means editing up to four places. Labels, icons and
keyboard access drift. The registry makes the destination one record and turns
each surface into a filtered, ordered view. It does **not** merge the surfaces;
they stay four.

## Contract

```ts
/** Stable, namespaced. Renaming is a breaking change. */
type EntryId = string; // "journal", "settings.trading", "journal.performance"

type SurfaceId = "rail" | "header" | "journal-tabs" | "settings-rail";

interface Entry {
  id: EntryId;
  labels: {
    label: TranslationKey;
    title?: TranslationKey;
    description?: TranslationKey;
  };
  /** Key into the central, trusted icon map. Never raw user input. */
  icon: IconKey;
  opener: Opener;
  /** Optional global shortcut, in addition to the surface route. */
  shortcut?: string;
  /** Tabs belong to a host; global destinations omit this. */
  parent?: EntryId;
  /** Optional stable analytics name; never contains user data. */
  telemetryName?: string;
  /** At least one. One entry can appear on several surfaces. */
  placements: Placement[];
}

interface Placement {
  surface: SurfaceId;
  group: GroupId;
  /** Explicit order inside (surface, group). */
  order: number;
  /** Required per placement; `none` is only allowed with a linked bug. */
  keyboard: KeyboardRoute;
  /** Render the entry at all. Default: always. */
  visibleWhen?: Condition;
  /** Allow interaction. Default: always. */
  enabledWhen?: Condition;
  /**
   * Visual selected state (an open panel, an active toggle). Default: not
   * selected. This is a hint for the surface, never a substitute for
   * `enabledWhen`; a selected entry can be disabled and must still render.
   */
  activeWhen?: Condition;
}
```

`labels` are translation keys only. A literal string in the registry fails
review: a missing key must fail the i18n check, not render English into a
German window. `icon` resolves through the existing trusted icon constants;
the registry does not accept inline SVG from features.

## Opener types

| Kind | Shape | Use |
| --- | --- | --- |
| `window` | `{ kind: "window"; windowType: WindowType; instance?: string }` | Open/raise a managed `WindowBase` destination (journal, settings, academy). |
| `toggle` | `{ kind: "toggle"; target: ToggleTarget }` | Show/hide a panel or modal-owned surface (assistant, market dashboard, alerts, rail panels). |
| `tab` | `{ kind: "tab"; tabId: string }` | Select a tab inside the entry named by the entry’s `parent` (settings rail, journal deep-dive strip). |
| `route` | `{ kind: "route"; path: string }` | Navigate to a route. No current shell destination uses it; SEO pages are out of scope. |

`ToggleTarget` and `windowType` are closed unions. A surface never calls a
component directly; one `openEntry(entry, handlers?)` adapter switches on
`opener.kind`. That adapter is the only place that knows `uiState`,
`windowManager` or router APIs. The optional handlers carry what only the host
can know: `selectTab` executes a `tab` opener inside the surface that owns the
selected-tab state. A tab opener without that handler throws; the adapter never
guesses.

The journal is the one state-dependent `window` opener: a minimized journal is
restored, otherwise the adapter toggles it open/closed. The rail shortcut only
ever renders while the journal is minimized, so it always restores; the header
uses the open/close case.

## Visibility and enabling vocabulary

Both `visibleWhen` and `enabledWhen` use the same small condition language.
It is the FEAT-0606 audit vocabulary made executable: “enabling state” is the
condition that decides whether a control can act; “visible?” is whether the
condition is readable on screen.

```ts
type Condition =
  | { kind: "always" }
  | { kind: "all"; conditions: Condition[] }
  | { kind: "any"; conditions: Condition[] }
  | { kind: "not"; condition: Condition }
  | { kind: "setting"; key: SettingKey; equals?: JsonValue }
  | { kind: "entitlement"; feature: "pro" }
  | { kind: "account"; exchange?: ExchangeId; active?: boolean }
  | { kind: "window"; id: EntryId; state: "open" | "minimized" }
  | { kind: "viewport"; minWidth: number }
  | {
      kind: "state";
      key: UiStateKey;
      equals?: JsonValue;
      notEquals?: JsonValue;
      present?: boolean;
      nonEmpty?: boolean;
    }
  | { kind: "derived"; key: DerivedFlagKey; truthy?: boolean }
  | { kind: "data"; key: DataKey; present?: boolean };
```

Mapping from the audit table’s prose to tokens:

| Audit phrase | Token |
| --- | --- |
| “—” (no precondition) | `always` |
| “a preset is selected” | `state("selectedPreset", nonEmpty: true)` |
| “Pro and not fetching and not `uiState.isLoading`” | `all(entitlement("pro"), not(derived("journalFetching")), not(state("isLoading")))` |
| “a journal window is minimized” | `window("journal", "minimized")` |
| “sidebar column rendered” | `all(setting("showSidebars"), viewport(1280))` |
| “panel renders from `effectiveShowSidebarActivity`” | `derived("effectiveShowSidebarActivity")` |
| “account is not active” | `state("activeAccountId", notEquals: accountId)` |
| “more than one account exists” | `derived("multipleAccounts")` |
| “fewer than five feeds” | `derived("rssFeedCapacityAvailable")` |

Only tokens with a fixed evaluator are allowed. A condition that cannot be
expressed is a contract gap: add a token and its test, do not pass a closure
from a surface. A closure would make the registry un-serializable and
untestable, which is the current problem in a different place.

`activeWhen` uses the same token language as `visibleWhen` and `enabledWhen`.
It only drives the surface's selected styling; it never hides or disables the
entry. `getSurfaceEntries` returns `active: false` for placements without the
condition, so a surface does not need its own selected-state rules. The rail
uses it for the assistant, the four panel toggles and the minimized-journal
shortcut; the journal condition repeats its `visibleWhen` because the shortcut
is selected exactly while it is offered.

Surfaces whose placements are all condition-free share
`STATIC_ENTRY_CONTEXT` (the header, the journal tab strip and the settings
rail). The registry tests pin that list, so a condition added to one of those
surfaces fails there before it can silently read zeroed values.

## Keyboard contract

Every entry has one `KeyboardRoute`:

```ts
type KeyboardRoute =
  | { kind: "shortcut"; keys: string; scope: "global" | SurfaceId }
  | { kind: "tab-order"; surface: SurfaceId }
  | { kind: "none"; reason: string; bug: string };
```

- `tab-order` is a valid route: the entry renders as a native `<button>` in the
  surface’s DOM order, reachable with Tab and activated with Enter/Space.
- `shortcut` is for a future global key. No current entry has one; adding one
  requires a conflict check against the existing hotkey settings.
- `none` is allowed only with an existing `BUG` id. CI fails a `none` without
  one. Pointer-only access is therefore visible in the data, not discovered by
  a user.

Current audit:

| Surface | Route | Note |
| --- | --- | --- |
| Left rail | `tab-order: rail` | Real buttons with `aria-label`; no global shortcut. |
| Header | `tab-order: header` | Journal buttons are real buttons; mobile/desktop variants are visibility, not route. |
| Journal tab strip | `tab-order: journal-tabs` | Real buttons; arrow-key roving is absent (FEAT-0605 N8), so Tab is the current route. |
| Settings rail | `tab-order: settings-rail` | Real buttons; arrow-key roving is absent, so Tab is the current route. |

All 23 entries use `tab-order` on their surface; none currently uses a global
`shortcut` or `none`. No current entry is pointer-only. The two tab strips lack
arrow-key roving; that is a keyboard-quality gap, not a pointer-only entry, and
should be filed once rather than patched in five surfaces.

## Registry entries

### Global destinations (10)

| ID | Label key | Icon key | Opener | Placements | Visibility / enabling |
| --- | --- | --- | --- | --- | --- |
| `journal` | `app.journalButton` | `icons.book` | `window` journal | header (always), rail (journal minimized) | rail: `window("journal","minimized")` |
| `settings` | `settings.title` | `icons.settings` | `window` settings | rail | always |
| `dashboard` | `app.marketDashboard.buttonTitle` | `rail-dashboard` | `toggle` market-dashboard | rail | always |
| `alerts` | `dashboard.alerts.panel.open` | `rail-alerts` | `toggle` alerts | rail | always |
| `academy` | `academy.title` | `rail-academy` | `window` academy | rail | always |
| `assistant` | `sidePanel.aiAssistant` | `rail-assistant` | `toggle` assistant | rail | always; active state from `state("showAssistant")` |
| `technicals` | `settings.showTechnicals` | `icons.chart` | `toggle` technicals | rail | visible always; enabled `derived("isTechnicalsVisible")` (BUG-0715) |
| `market-overview` | `settings.toggleMarketTiles` | `rail-market-overview` | `toggle` market-overview | rail | visible always; enabled `all(setting("showSidebars"), viewport(1280))` |
| `market-activity` | `dashboard.marketActivity` | `rail-market-activity` | `toggle` market-activity | rail | visible always; enabled `derived("effectiveShowSidebarActivity")` (BUG-0715) |
| `market-sentiment` | `settings.toggleMarketSentiment` | `rail-market-sentiment` | `toggle` market-sentiment | rail | visible always; enabled `viewport(1280)`; below `xl` the mobile copy has a different condition (BUG-0715) |

`rail-*` names are registry icon keys for the inline SVGs currently local to
`LeftControlPanel`; migration lifts them into the central icon map. `icons.*`
names are the existing constants and are reused as-is.

Rail placements also declare `activeWhen`: `journal`
`window("journal","minimized")`, `assistant` `state("showAssistant")`,
`technicals` `setting("showTechnicals")`, `market-overview`
`setting("showMarketOverview")`, `market-activity`
`setting("showSidebarActivity")` and `market-sentiment`
`setting("showMarketSentiment")`.

### Journal deep-dive tabs (5)

Parent `journal`; opener `{ kind: "tab", tabId }`; surface `journal-tabs`;
always visible; `tab-order`.

| ID | Label key | Icon key | Tab |
| --- | --- | --- | --- |
| `journal.performance` | `journal.deepDive.performance` | `icons.chart` | `performance` |
| `journal.quality` | `journal.deepDive.systemQuality` | `icons.check` | `quality` |
| `journal.direction` | `journal.deepDive.charts.labels.trends` | `icons.exchange` | `direction` |
| `journal.discipline` | `journal.deepDive.behavior` | `icons.lockClosed` | `discipline` |
| `journal.costs` | `journal.deepDive.charts.labels.fees` | `icons.settings` | `costs` |

The strip executes selection through `openEntry(entry, { selectTab })`; the
host passes its own selected-tab setter, and the tab id comes from the entry's
opener.

### Settings rail tabs (8)

Parent `settings`; opener `{ kind: "tab", tabId }`; surface `settings-rail`;
always visible; `tab-order`.

| ID | Label key | Icon key | Tab |
| --- | --- | --- | --- |
| `settings.trading` | `settings.tabs.trading` | `settings-trading` | `trading` |
| `settings.automation` | `settings.tabs.automation` | `settings-automation` | `automation` |
| `settings.chart` | `settings.tabs.chart` | `settings-chart` | `chart` |
| `settings.visuals` | `settings.tabs.visuals` | `settings-visuals` | `visuals` |
| `settings.ai` | `settings.tabs.ai` | `settings-ai` | `ai` |
| `settings.connections` | `settings.tabs.connections` | `settings-connections` | `connections` |
| `settings.system` | `settings.tabs.system` | `settings-system` | `system` |
| `settings.cloud` | `settings.tabs.cloud` | `settings-cloud` | `cloud` |

`settings-*` icon keys live in the central icon map as full `<svg>` elements
lifted from `SettingsContent`; `TabBar` renders the resolved markup directly.
The rail executes selection through `openEntry(entry, { selectTab })`, like
the journal tab strip. `SettingsContent` keeps only the id → content-component
map, which is not destination data.

## Surface mapping

| Surface | View rule | Entries |
| --- | --- | --- |
| Left rail | `placements[].surface === "rail"`, grouped and ordered; only `window`/`toggle` openers | 10 global destinations, groups `destinations` then `panels` |
| Header | `placements[].surface === "header"` | `journal` only; its header placement is always visible |
| Journal tab strip | `parent === "journal"` and `opener.kind === "tab"` | 5 deep-dive tabs |
| Settings rail | `parent === "settings"` and `opener.kind === "tab"` | 8 rail tabs |

The header’s preset loader/save/delete, input reset and theme switch are
**actions, not destinations**. They stay in the header and are outside this
registry; the opener types are deliberately limited to `window | toggle | tab |
route`. A command registry is a separate contract if it is ever needed.

Journal’s own Table/Overview/Deep Dive view switch and settings sub-tabs are
inside a host, not on the four audited surfaces. They are out of scope until
the registry is adopted; modelling them later is a `parent` extension, not a
new surface.

## Ownership and grouping

- The registry module is owned by the UI platform owner (the same owner as the
  window manager and design-system primitives).
- A feature owner may propose an entry in a PR; the registry owner approves
  label keys, icon, opener, placement and conditions.
- One registry file (plus its tests) is the only place a destination is
  declared. Surface-local destination lists are removed, not kept in sync.
- Groups are stable IDs with a label key. A new group requires registry-owner
  approval; a group is not created for a single entry without a reason.
- Entry IDs are stable. Renaming or removing one is a breaking change and
  needs a migration/alias because telemetry, shortcuts and saved state may
  refer to it.
- `order` is explicit per placement. Surface views never sort by label; locale
  changes must not move buttons.

## Validation (must run in CI)

1. Unique `id`; every `parent` exists; every tab opener points at its parent.
2. Every label/title/description key exists in both `en.json` and `de.json`.
3. Every entry has an icon, opener and at least one placement; every placement
   has a keyboard route.
4. Every placement surface is one of the four; `order` is unique per
   `(surface, group)`; a tab’s `parent` exists and hosts that surface.
5. Every condition uses a known token and a known setting/state key; no
   functions, no free-form strings.
6. `keyboard.kind === "none"` requires an existing bug id.
7. Surface inventory tests: each of the four views renders exactly the entries
   selected by its rule; adding an entry without a placement fails.
8. Source scan: no surface file declares its own destination label/icon/opener
   list after migration.

## Migration order (follow-up item)

1. Add the registry data, types and validation tests; no UI change.
2. Move the left rail to the registry (largest win; 10 entries).
3. Move the header journal placement; keep the action cluster as-is.
4. Move the journal tab strip.
5. Move the settings rail.
6. Delete the four local lists and add the source scan.

Each step is one reviewable PR. No surface is merged into another; the
registry is a data source, not a navigation redesign.
