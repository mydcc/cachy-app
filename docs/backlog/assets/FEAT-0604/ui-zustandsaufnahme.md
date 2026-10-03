# UI status quo — windows, elements, CSS debt

Baseline read of the Cachy UI, taken 2026-10-03 against `develop` at `d853139c6`.
This is the evidence base for [FEAT-0604](../../features/FEAT-0604-ui-status-quo-audit.md)
and for every item that depends on it. It is a snapshot, not a living contract —
when a number here is wrong, fix the number here in the same PR that changes it.

Method: `grep`/`read` over the source, not a visual audit. Counts are line
counts from those greps and can be reproduced.

---

## 1. Application shell zones

`src/routes/+page.svelte` (938 lines) is the entire shell. It is one flex/grid
wrapper whose layout mode flips on a single setting:

```
+page.svelte
├─ <svelte:window onkeydown>        global shortcuts
├─ <LeftControlPanel />             floating left control rail, 249 lines
└─ wrapper  flex flex-col / xl:grid grid-cols-[1fr_auto_1fr]
   ├─ LEFT SIDEBAR   hidden xl:flex  →  sticky top-8 flex flex-col gap-3 w-96 shrink-0 z-40
   │                 ├─ NewsSentimentPanel      gate: showMarketSentiment
   │                 └─ PositionsSidebar        gate: effectiveShowSidebarActivity
   ├─ MAIN           <main class="max-w-3xl calculator-wrapper glass-panel rounded-2xl p-4 sm:p-8">
   │                 ├─ ConnectionStatus                (#market-overview-widget)
   │                 ├─ header row  flex flex-col md:flex-row
   │                 │    ├─ CachyIcon + <h1>
   │                 │    ├─ #journal-toggle-btn                    (mobile only)
   │                 │    └─ #preset-loader  <select class="input-field px-3 py-2">
   │                 │        #save-preset-btn
   │                 │        #delete-preset-btn   disabled={!presetState.selectedPreset}
   │                 │        #reset-btn
   │                 │        #theme-switcher       oncontextmenu cycles backward
   │                 │        #view-journal-btn-desktop
   │                 ├─ #trade-setup-card  grid md:grid-cols-2 gap-x-8
   │                 │    ├─ GeneralInputs / PortfolioInputs / ExchangeAccountControls
   │                 ├─ #results  grid md:grid-cols-2  (.result-item / .result-group)
   │                 ├─ action row  grid-cols-[1fr_auto_1fr] items-center
   │                 └─ xl:hidden  mobile market overview
   └─ RIGHT SIDEBAR  hidden xl:flex  →  MarketOverview
                                     + TechnicalsPanel  (absolutely positioned)
                                     + Favorites
```

Facts worth naming:

- **The sidebar width is the constant `w-96`** (384 px), written into the class
  attribute. Not a token, not resizable, not persisted.
- **Layout mode is driven by one boolean.** `showSidebars` decides grid vs flex
  *and* left vs right sidebar visibility. There is no independent control for
  either side.
- **The header button cluster is the only navigation affordance** on the main
  surface, and it mixes four different concerns: presets (data), theme
  (preference), reset (destructive), journal (navigation).
- **Two responsive systems coexist.** The shell reacts to viewport breakpoints
  (`xl:`); the settings window reacts to container queries (`@container`). See
  §3.

---

## 2. Window system

There is a real window system. It is not a greenfield, and it is not uniform.

| Layer | Files | Lines |
| --- | --- | --- |
| Core | `src/lib/windows/` — `types.ts`, `WindowBase.svelte.ts`, `WindowManager.svelte.ts`, `WindowRegistry.svelte.ts`, `zLayers.ts`, `fitContentHeight.ts` | ~11 954 incl. tests |
| Frame | `src/components/shared/windows/WindowFrame.svelte` | **1 373** |
| Container | `WindowContainer.svelte` (178), `ModalFrameContent.svelte` (56) | 234 |
| Implementations | `src/lib/windows/implementations/` — AcademyWindow, AlertPanelWindow, AssistantWindow(+View), CandleChartView, ChannelWindow/View, ChartWindow, ChatWindow/ChatTestView, DialogWindow/View, IframeWindow/View, MarkdownWindow/View, MarketDashboard, ModalFrameWindow, ModalWindow, NewsFrameWindow, SymbolPickerWindow/View | 17 modules, each with a `.test.ts` |

`WindowType` is a 17-value union: `window`, `modal`, `iframe`, `chart`, `news`,
`settings`, `chatbox`, `symbolpicker`, `journal`, `guide`, `changelog`,
`privacy`, `whitepaper`, `assistant`, `channel`, `academy`, `alertpanel`,
`dialog`.

### 2.1 The flags do not agree with each other

`WindowFlags` carries ~30 keys. Three sets overlap semantically:

| Concern | Keys that claim it |
| --- | --- |
| Maximize | `allowMaximize`, `showMaximizeButton` |
| Header | `headerAction`, `headerButtons`, `doubleClickBehavior`, `doubleClickAction` |
| Chrome/visual | `isTransparent`, `enableGlassmorphism`, `enableBurningBorders`, `showBackdrop`, `showCachyIcon`, `showIcon` |

Nothing documents which of a pair wins. This is the first thing to fix,
because magnetic tiling (§4) has to decide what a window's *edge behaviour* is
and cannot while two flags mean the same thing.

### 2.2 A live type/state drift

`doubleClickBehavior` is typed `'maximize' | 'pin'`, but `resolveDoubleClickAction()`
in `WindowBase.svelte.ts` explicitly widens for the value `'minimize'` still
present in persisted state. Users who saved state before the narrowing carry a
value the type no longer admits. Not cosmetic — it is the reason a persisted
window can behave differently on reload than it did before.

### 2.3 Pinning exists; tiling does not

`WindowBase` holds `isPinned: boolean` and
`pinSide: 'left' | 'right' | 'top' | 'bottom' | 'none'`. `togglePin()` is
annotated *"Pinning logic (experimental tiling)"* and does exactly one thing:
if `pinSide === 'none'` it returns, otherwise it flips `isPinned`, un-maximizes
and saves.

**There is no drag-to-edge magnetic snapping anywhere.** Searching `WindowFrame.svelte`
for `snap|magnet|threshold` matches only the `pinned-left` / `pinned-right` CSS
class names. Only one call site in `WindowRegistry.svelte.ts:420` ever sets a
`pinSide`, and it sets `left`.

So the affordance exists in the data model, has a UI class, and has no gesture.

---

## 3. Settings

29 components in `src/components/settings/`, 16 tab/sub-tab modules in
`tabs/`.

### 3.1 Structure

`SettingsContent.svelte` (171 lines) holds a flat array of 8 tabs:

| id | label source |
| --- | --- |
| `trading` | `$_("settings.tabs.trading") \|\| "Trading"` |
| `automation` | `$_("settings.tabs.automation") \|\| "Automation"` |
| `chart` | `$_("settings.tabs.chart") \|\| "Chart"` |
| `visuals` | `$_("settings.tabs.visuals") \|\| "Visuals"` |
| `ai` | `$_("settings.tabs.ai") \|\| "Intelligence"` |
| `connections` | `$_("settings.tabs.connections") \|\| "Connections"` |
| `system` | `$_("settings.tabs.system") \|\| "System"` |
| `cloud` | **`"Cloud"` — hardcoded English** |

The rail is `role="tablist"` with `px-4 py-3` buttons and a
`border-l-2` / `border-b-2` active marker. The content area is
`@container flex-1 overflow-y-auto p-4 md:p-8`.

Two things follow from the array shape:

- The content area is an `{#if}/{:else if}` chain over tab ids, not a keyed
  `{#each}` with a dynamic component. Adding a tab means editing three places.
- `VisualsTab` introduces a **second tab bar** — pill buttons
  (`px-3 py-1.5 text-xs rounded-lg`) backed by `uiState.settingsVisualsSubTab`.
  Two visual languages, one settings window. `VisualsLayout` is the only
  sub-tab with real content besides Appearance and Background, and it holds
  exactly two toggles.

### 3.2 The grid rule already exists and is already half-broken

`src/components/settings/shared/SettingsGrid.svelte` documents its own rules in
a docblock, and they are the right ones:

1. Columns react to the **settings window's** width via a container query,
   never to the viewport.
2. Exactly one threshold, 560 px (+960 px for 3-col). No per-tab `sm:/md:/lg:`.
3. Full-width items use `col-span-full` on the child.
4. Flex children need `min-w-0` / `shrink-0`.
5. `gap` carries the section rhythm; columns always come from this component.

Adoption:

| Uses `SettingsGrid` | Count |
| --- | --- |
| `IndicatorSettings` | 53 |
| `ChartTab` | 11 |
| `TradingTab` | 11 |
| `SystemTab` | 11 |
| `ConnectionsTab` | 7 |
| `VisualsLayout` | 5 |
| `AiTab` | 5 |
| `PaperTradingSettings` | 3 |
| `RiskLimitsSettings` | 3 |
| `HotkeySettings` | 3 |

Hand-written grids that bypass it:

- `IndicatorSettings.svelte:311`, `:399` — `grid grid-cols-1 gap-2`
- `VisualsAppearance.svelte` — lines 58 (`grid-cols-1 sm:grid-cols-3`), 179
  (`w-full grid grid-cols-1 md:grid-cols-3`), 260, 267, 301, 330
  (`grid-cols-2 sm:grid-cols-4`), 378 (`sm:grid-cols-2 md:grid-cols-3`), 513, 589
- `VisualsBackground.svelte` — lines 271, 311, 349, 388, 429, 471, 477, 541, 683

That is ~20 violations concentrated in the two tabs a user visits to change how
the app *looks* — which is where a density control would land.

### 3.3 The store is the bottleneck

`src/stores/settings.svelte.ts` is **2 166 lines**. Every boolean costs six
sites:

```
defaultSettings.<flag>     (line 124 for showSidebars, 206 for showMarketSentiment)
<flag> = $state<boolean>(defaultSettings.<flag>)
load path                  (1558, 1712, 1943)
save path                  (2053)
getter, where the value is derived rather than read (722)
```

`src/stores/settings/migrations.ts` exists, so the migration mechanism is
already there — but `density`, `compact` and `fontSize` do not exist as settings
at all. A three-mode density setting added the ad-hoc way would be the sixth
such flag and the last one anyone could find.

---

## 4. Control sizes — the 42 px problem

`src/themes.css` is 3 223 lines. `src/app.css` is 245.

```css
/* themes.css:2246 */
.input-field      { height: 42px; max-height: 42px; }
textarea.input-field { height: auto; min-height: 4.5rem; }

/* the existing proto-density hack */
.input-field-sm   { height: 34px !important; max-height: 34px !important;
                    font-size: var(--text-xs); }

/* and a fourth, narrower thing */
.settings-number-input { width: 70px; padding: 0.25rem 0.5rem; }
```

Two densities exist and neither is a mode: one is the default, one is a `!important`
override added where someone needed something smaller. There is **no
`--control-height` token anywhere.** The token set has `--space-1..8`,
`--radius-sm/md/lg/xl/full`, `--text-xs..2xl` — spacing and colour were
designed for, control geometry was not.

---

## 5. Buttons

| Fact | Value |
| --- | --- |
| Raw `<button>` elements | **364** across 167 `.svelte` files |
| Uses of `btn-accent-bg` / `btn-default-bg` / `btn-danger-bg` | **16** |
| Vertical-padding variants on `<button>` | `py-1.5` ×49, `py-2` ×44, `py-1` ×37, `py-2.5` ×11, `py-0.5` ×5, `py-3` ×4 |
| `src/components/shared/Button.svelte` | exists, has `Button.component.test.ts`, **imported by zero components** |

Six heights for one conceptual control. And the primitive meant to end that is
already written and already tested — it just never got adopted.

`Button.svelte` as it stands: props `title`, `ariaLabel`, `onClick`, `children`,
`extraClasses`, `disabled`; renders `<button class="btn-base {extraClasses}">`;
scoped `.btn-base` sets `display:inline-flex`, centring, `border:none`,
`cursor:pointer`, `transition:all .2s ease`, `font-family:inherit`. No variants,
no sizes, no density awareness.

### 5.1 Navigation is distributed, not designed

There is no app nav or shell component. Entry points are scattered across:

| Surface | File | What it is |
| --- | --- | --- |
| Floating left rail | `src/components/shared/LeftControlPanel.svelte` (249) | the app's only persistent chrome |
| Main header cluster | `src/routes/+page.svelte` | presets + theme + reset + journal |
| Journal tab strip | `DashboardNav.svelte` (81) | journal-local deep-dive presets, `px-4 py-2 rounded-t-lg` |
| Settings rail | `SettingsContent.svelte` | 8 tabs |
| Window layer | `WindowManager` | windows themselves |

`src/components/layout/` contains exactly one file, `Header.svelte` (98 lines).

---

## 6. CSS debt, named

| # | Name | Evidence | Why it hurts |
| --- | --- | --- | --- |
| C1 | **No control-geometry token layer** | `.input-field` 42 px literal; `.input-field-sm` 34 px with `!important`; `.settings-number-input` 70 px wide | every control-size change is a search-and-replace; density cannot be a mode |
| C2 | **Two responsive systems** | viewport `xl:` in `+page.svelte` vs `@container` + `@min-[560px]` in `SettingsGrid` | the same component behaves differently depending on which container it lands in |
| C3 | **Two z-index systems** | `src/lib/windows/zLayers.ts` **and** 29 raw literals (`z-[N]` / `z-index: N`) | layering is decided at the call site; window stacking cannot be reasoned about globally |
| C4 | **110 hardcoded px dimensions** in `.svelte` (`h-[Npx]`, `min-h-[Npx]`, `w-[Npx]`, `height: Npx`) | — | the density mode cannot reach them |
| C5 | **30 `!important`** (29 in `themes.css`, 1 in `app.css`) | — | every one is an override that outlived its cause |
| C6 | **84 inline `style="…"`** attributes in `.svelte` | — | per-instance styling that no theme can reach |
| C7 | **Six button heights, one dead primitive** | §5 | see §5 |
| C8 | **Two tab-bar languages in one window** | §3.1 | — |
| C9 | **`transition: all .2s ease`** on the dead `Button.svelte` and elsewhere | — | animates layout-affecting properties on interaction; interacts badly with glassmorphism and burning borders |
| C10 | **Hardcoded strings in settings** | `"Cloud"` label; `\|\| "English"` fallbacks on 7 tab labels and on `DashboardNav` default presets | same class as BUG-0601 / BUG-0602; German users see English labels |

---

## 7. Findings not in the original brief

Ten things the audit turned up that the four seed questions did not ask for.

**N1 — Density is not one axis.** 42 → 32 px is the visible part. A mode that
only changes control height produces a cramped UI, not a dense one: line-height,
font-size, section padding and gap all have to move together, or the result
reads as "someone shrank the inputs" rather than "this fits more rows".

**N2 — 32 px is an accessibility decision, not only a taste one.** WCAG 2.2
SC 2.5.8 (AA) sets a 24 × 24 CSS px minimum target; 32 px clears it. SC 2.5.5
(AAA) asks for 44. The consequence worth deciding before shipping: on a
touch-primary device, compact inputs are hostile, and `+page.svelte` already
has a distinct mobile branch. Density needs an explicit mobile policy.

**N3 — The settings store is the thing that will block density, not the
settings UI.** Six touchpoints per flag × three modes. `migrations.ts` already
exists; the new setting must register there or it becomes the seventh ad-hoc
flag.

**N4 — `SettingsGrid`'s 560 px threshold may be unreachable.** It is a
container query on the settings window. If the settings window's `minWidth` is
below 560 px, the two-column layout silently never triggers and no test would
notice. Worth checking before the grid work, because it decides whether the
breakpoint is real.

**N5 — Nothing measures density.** Playwright is configured. A global control
height change with no screenshot baseline turns "does it look better" into an
argument nobody wins. A baseline is cheap now and expensive later.

**N6 — Absolutely-positioned content is a density hazard.**
`TechnicalsPanel` is absolutely positioned inside the right sidebar. Density
changes heights; absolute positioning plus changed heights is how panels start
overlapping.

**N7 — There is no "reset layout" for windows or sidebars.** The calculator has
`#reset-btn`. Once windows can be snapped and sidebars resized, a user needs a
way back to a known state, or a bad arrangement is permanent.

**N8 — ARIA is inconsistent between the two tab bars.** `SettingsContent` has
`role="tablist"`; whether it also has `role="tab"` / `aria-selected` / roving
tabindex / arrow-key navigation needs checking. `VisualsTab`'s pills appear to
have no roles at all. Adding tabs and sub-tabs without settling this makes it
worse.

**N9 — One compaction precedent exists, and it was narrow.**
[FEAT-0328](../../features/FEAT-0328-compact-account-controls-and-fee-display.md)
shipped in 1.6.0-beta.195 and compacted exactly one component.
[BUG-0411](../../bugs/BUG-0411-modal-windows-oversized-polish.md)
(`done`) already took a pass at modal sizing. Both mean: a density item that
claims "compact the whole app" will collide with history, and should be scoped
as *token infrastructure* plus *adoption in named areas*.

**N10 — Window sizing was already touched once.** BUG-0411 is `done`. Magnetic
tiling and window sizing overlap; the new items must not re-open that
conclusion without saying what it changed.

---

## 8. Reading this document

Sections 1–6 are measurements. If a number drifts, the number is stale, not the
code. Sections 7's N1–N4 and N9 are the ones that constrain *ordering* rather
than describing state — those are why the token layer precedes the density mode,
and why the density mode precedes the settings reorganisation in execution even
though the settings work is specced first.
