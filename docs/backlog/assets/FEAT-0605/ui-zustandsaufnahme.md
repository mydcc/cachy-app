# UI status quo — windows, elements, CSS debt

Baseline read of the Cachy UI, taken 2026-10-03 against `develop` at `d853139c6`.
This is the evidence base for [FEAT-0605](../../features/FEAT-0605-ui-status-quo-audit.md)
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
| Raw `<button>` elements | **258** across 89 `.svelte` files (after FEAT-0613; 296 after FEAT-0612, 302 after FEAT-0611, 368 before FEAT-0610) |
| Uses of `btn-accent-bg` / `btn-default-bg` / `btn-danger-bg` | **16** |
| Vertical-padding variants on `<button>` | `py-1.5` ×41, `py-2` ×25, `py-1` ×26, `py-2.5` ×8, `py-0.5` ×5, `py-3` ×4 (re-counted on the FEAT-0611 cards branch) |
| `src/components/shared/Button.svelte` | adopted by the app shell header (5 controls, FEAT-0610), the whole settings window (FEAT-0611, both stages), the calculator/trade panel (FEAT-0612) and the journal plus window chrome (FEAT-0613); variants/sizes in tokens, `Button.component.test.ts` covers them |

Six heights for one conceptual control. FEAT-0610 gave the primitive variants
(`default`, `accent`, `danger`, `success`), three token-based sizes
(34 / 42 / 48 px) and named transitions, then moved the five header controls
onto it. FEAT-0611 added `ghost`, `ghost-danger`, `outline`, `outline-accent`
and `warning` for the settings window's secondary and destructive actions.
That cluster is now one height (42 px, matching `#preset-loader`); the
calculator, journal and window surfaces still carry the padding variants until
FEAT-0612–0613.

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

**N4 — `SettingsGrid`'s 560 px threshold is real; the settings window's
`minWidth` is what can never take effect. Measured.** The grid is a container
query (`src/components/settings/shared/SettingsGrid.svelte:56`, `gridClass`:
`@min-[560px]:grid-cols-2`, `@min-[960px]:grid-cols-3`) on the padded content
div (`src/components/settings/SettingsContent.svelte:135`, `p-4 md:p-8`), so it
measures the settings content box, not the window frame. The settings window
(`src/lib/windows/WindowRegistry.svelte.ts:321`) spreads `...baseLayout`,
overrides only `width` and `height` (`:336`) and so inherits `minWidth: 200`
(`:95`) — but its flags set `isResizable: false` (`:330`), and the resize grips
are gated on exactly that
(`src/components/shared/windows/WindowFrame.svelte:956`). No path consults the
minimum: the grips never render, and maximize assigns the viewport width
directly (`src/lib/windows/WindowBase.svelte.ts:646`), bypassing the size clamp.
**The layout is not unreachable — the `minWidth` is.** It is reached at the
1000 px floating width and lost below the container threshold, which is
reachable through responsive auto-maximize (`WindowBase.svelte.ts:364`,
`edgeToEdgeBreakpoint: 768` at `WindowRegistry.svelte.ts:333`) and through a
double-click maximize (`allowMaximize` `:326`, `doubleClickAction: 'maximize'`
`:87`). Filed as
[BUG-0696](../../bugs/BUG-0696-settings-window-inherits-an-inert-minwidth.md).

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

**N8 — ARIA is inconsistent between the two settings tab bars. Measured.**
`src/components/settings/SettingsContent.svelte` carries `role="tablist"`
(`:95`), `role="tab"` (`:104`) and `aria-selected` (`:105`) — but the file
contains no `tabindex`, no `ArrowRight`/`ArrowLeft` and no keydown handler at
all. The tabs are native `<button>` elements (`:98`), so each is Tab-focusable
and Enter/Space-activatable; what is missing is the APG roving-tabindex and
arrow-key pattern, which leaves the tab list announced correctly but
pointer-only in practice.
`src/components/settings/tabs/VisualsTab.svelte`'s sub-navigation (`:52`) is
bare `<button>` elements with no role and no `aria-selected`, while its wrapper
claims `role="tabpanel"` (`:46`) — a tabpanel with no tab pointing at it. That
pairing is not a quirk of this component: five settings tabpanels exist
(`VisualsTab.svelte:46`, `AiTab.svelte:215`, `ConnectionsTab.svelte:101`,
`TradingTab.svelte:71`, `SystemTab.svelte:261`) and `aria-controls` appears
nowhere under `src/components/settings/`. Outside settings, two components
implement the pattern properly and are the references to copy:
`src/components/alerts/AlertPanelView.svelte:210` (`onTabKeydown`) and
`src/components/shared/AcademyTabs.svelte:81`. The inconsistency is wider than
settings: `grep -rl 'role="tablist"' src --include='*.svelte'` returns five
files, and `alerts/tabs/ManageTab.svelte` and `shared/TpSlPriceInput.svelte`
carry neither `tabindex` nor arrow keys either. Both settings tab bars need
settling before more tabs are added.

**N9 — One compaction precedent exists, and it was narrow. Out-of-scope clauses
read; the item's other claims are its own record and were not re-measured
here.**
[FEAT-0328](../../features/FEAT-0328-compact-account-controls-and-fee-display.md)
shipped in 1.6.0-beta.195 and compacted exactly one component. Its `## Out of
scope` (line 289) excludes multi-trade / hedge-mode order entry and changing
*how* position size is computed from leverage, and it records a deliberate
non-build — "max position size" (line 103) — because a cap the exchange would
refuse is a misleading number on a money screen.
[BUG-0411](../../bugs/BUG-0411-modal-windows-oversized-polish.md) (`done`) is
pure frame polish: its out-of-scope line (61) excludes **any** behaviour change
— picks, confirms, writes and reads belong to BUG-0409/BUG-0410 — plus new
settings and new dialogs; only the frame was wrong, the dialog content itself
was verified correct. Both mean: a density item that claims "compact the whole
app" will collide with history, and should be scoped as *token infrastructure*
plus *adoption in named areas*.

**N10 — Window sizing was already touched once.** BUG-0411 is `done`. Magnetic
tiling and window sizing overlap; the new items must not re-open that
conclusion without saying what it changed.

---

## 8. Buttons — placement, visibility and enablement (FEAT-0606)

Snapshot: `develop` at `8fcbcd251`, 2026-10-21. Method: `grep -c '<button'` plus a
read of every control in the four surfaces named by the item; not a visual audit.

Scope decision (the item's open question): the always-visible surfaces are
covered exhaustively. Popovers and dropdowns are included where they carry a
destructive or money-relevant control — the preset loader, the account switcher,
the custom-provider manager, the column-settings popover. The symbol picker is
not covered; it is a search surface with no state of its own.

Counts in scope: **204 `<button>` source occurrences** across 48 components,
plus the `#preset-loader` select and the window title's `role="button"` — 206
source sites, all listed below. Several rows are `{#each}` templates that render
more than one control; rows labelled "(N)" or "per …" say how many. The count is
therefore a count of code sites, not of rendered buttons — the runtime number is
higher. The app-wide count is in §5.

Reading the tables: "Enabling state" is the condition that decides whether the
control can act, whether or not it is expressed as `disabled`. "Visible?" asks
whether that condition is readable on screen without hovering, and whether it is
readable *at the moment the control is shown*. "—" means the control has no
precondition.

### 8.1 App shell

| Surface | Control | Action | Enabling state | Visible? |
| --- | --- | --- | --- | --- |
| Header | `#journal-toggle-btn` (mobile, `md:hidden`) | opens the journal modal | — | — |
| Header | `#preset-loader` (select) | applies the chosen preset on change | — | — (selection is shown) |
| Header | `#save-preset-btn` | prompts for a name, then saves | — | — |
| Header | `#delete-preset-btn` | confirms, naming the preset, then deletes it | a preset is selected | yes — the loader shows its placeholder when none is |
| Header | `#reset-btn` | confirms, then resets every input except symbol and trade type | — | — |
| Header | `#theme-switcher` | cycles theme forward; right-click cycles backward | — | icon shows the current theme; the backward gesture is undiscoverable |
| Header | `#view-journal-btn-desktop` (`hidden md:inline-block`) | opens the journal modal | — | — |
| Trade-form footer | pulse `🚀` | projectile effect | — | — |
| Footer | Language DE / EN | sets the locale | — | yes — active flag |
| Footer | Quiz | starts the quiz | — | — |
| Footer | Iframe toggle | shows or hides the floating iframe | — | yes — icon follows the state |
| Footer | Iframe channel (per channel) | opens that channel | — | — |
| Footer | Guide / Changelog / Privacy / Whitepaper | open the matching modal | — | — |
| Left rail | Dashboard | opens the market dashboard | — | — |
| Left rail | Settings | opens the settings window | — | — |
| Left rail | Alerts | opens the alert panel | — | — |
| Left rail | Academy | opens the academy window | — | — |
| Left rail | Assistant | toggles the assistant panel | — | yes — `class:active` |
| Left rail | Journal restore | raises and restores a minimized journal window | a journal window is minimized | the button exists only then |
| Left rail | Technicals | toggles `showTechnicals`, the same flag the chevron writes | the sidebar column is on (`showSidebars`) | yes — one flag; disabled with a reason while the column is off (BUG-0715) |
| Left rail | Market overview | sets `showMarketOverview` | sidebar column rendered; the panel exists at both widths | yes — the panel follows the flag |
| Left rail | Market activity | toggles `showSidebarActivity` | `effectiveShowSidebarActivity` (Pro, keys or paper account) and the sidebar column | yes — active follows the derived value; disabled with a reason without an account (BUG-0715) |
| Left rail | Sentiment | toggles `showMarketSentiment` | the sidebar column; the panel also needs `enableNewsAnalysis` and a news key at both widths | yes — the mobile copy honours the same flag (BUG-0715) |
| Right sidebar | Toggle technicals (`#btn-toggle-technicals`) | shows or hides the panel | the sidebar column exists | — |
| Right sidebar | Open chart | opens a chart window | — | — |
| Right sidebar | Refresh stats | refetches the price | — | — |
| Right sidebar | Open / close channel | toggles the channel view | — | yes — icon and title follow the state |
| Right sidebar | Favorite | adds or removes the symbol | — | yes — icon and title follow the state |
| Sidebars | Refresh news (two placements) | refetches the feed | — | — |
| Sidebars | Open news settings (two placements) | opens Settings → Connections | — | — |
| Sidebars | Open article in new tab (per item) | opens the article | — | — |
| Sidebars | Expand / collapse the feed | toggles the panel | — | yes — label follows the state |
| Sidebars | Positions tab rail (4: positions, orders, TP/SL, history) | switches the tab | — | yes — active class |
| Sidebars | View mode (2: detailed, focus) | sets the row density | — | yes — check mark |
| Sidebars | Technicals → market settings | opens Settings → Trading → Market | — | — |

### 8.2 Journal

| Surface | Control | Action | Enabling state | Visible? |
| --- | --- | --- | --- | --- |
| Journal toolbar (filters) | Sync history | fetches Bitunix history | Pro **and** not fetching **and** not `uiState.isLoading` | partly — lock icon for Pro, spinner for fetching; `isLoading` has no cue (BUG-0719) |
| Journal body | Table / Overview / Deep Dive tabs | switch the main view | — | yes — active class |
| Journal body | Column settings `OK` | closes the popover | — | — |
| Journal body | Column presets: compact / standard / fees / all | apply a column set | — | — |
| Journal body | Export CSV | downloads the journal | — | — |
| Journal body | Import CSV | opens the file picker | — | — |
| Journal body | Clear all | empties the journal | — | confirmed (`modalState`) |
| Journal filters | Live / Paper / All | switch the trade-mode filter | — | yes — active class |
| Journal filters | Table settings (gear) | toggles the column popover | — | the popover is the state |
| Journal filters | Today / Week / Month / 30 days / YTD / All | set the date range | — | no active marker; the date inputs show the result |
| Journal filters | Reset filters | clears all filters | — | — |
| Journal table | Group toggle (per symbol row) | expands or collapses the group | — | icon rotation |
| Journal table | Screenshot zoom (parent and sub rows) | opens the lightbox | the trade has a screenshot | the button renders only then |
| Journal table | Open detail (parent and sub rows) | opens the drawer | — | — |
| Journal table | Delete (parent row) | deletes the trade | — | confirmed (`confirm()`) |
| Journal table | Previous / next page | paginate | page is not first / not last | yes — page indicator |
| Journal table | Lightbox close | closes the lightbox | — | — |
| Trade drawer | Close | closes the drawer | — | — |
| Trade drawer | Save notes | writes the notes | — | — (no disabled-when-unchanged state) |
| Trade drawer | Open screenshot / close screenshot | lightbox | — | — |
| Deep dive | Year pill (per year) | selects the year | — | yes — active class |
| Overview | Preset tab (per preset) | selects the chart preset | — | yes — active class |
| Entry tags | Remove tag (`×`) | removes the tag | — | — |
| Entry tags | Suggestion chip | adds the suggested tag | — | — |

### 8.3 Window frames

| Surface | Control | Action | Enabling state | Visible? |
| --- | --- | --- | --- | --- |
| Window frame | Header control (per `win.headerControls`) | `ctrl.action()` | `headerControls.length > 0` and not minimized | yes — `ctrl.active` |
| Window frame | Window title (`role="button"`) | toggles the window mode | `headerAction === "toggle-mode"` | no — the clickability is cursor-only, and the button semantics exist on every window — BUG-0717 |
| Window frame | Zoom out / in | 50 %–200 % content zoom | `allowZoom` | **no** — never disables at the bound — BUG-0712 |
| Window frame | Export | `onHeaderExport()` | `headerButtons` includes `export` | — |
| Window frame | Delete | `onHeaderDelete()` | `headerButtons` includes `delete` | — (confirmation is the window's own concern) |
| Window frame | Open in new tab | `onHeaderOpenInNewTab()` | `headerButtons` includes `openInNewTab` | — |
| Window frame | `A-` / `A+` | 8 px–32 px font size | `allowFontSize` | **no** — never disables at the bound, and the size is not displayed — BUG-0712 |
| Window frame | Feed duck `🍞` | triggers the duck effect | `allowFeedDuck` | — |
| Window frame | Minimize | minimizes | `showMinimizeButton` | — |
| Window frame | Maximize / restore | toggles maximize | `showMaximizeButton` | yes — icon and title follow the state |
| Window frame | Close | closes the window | — | — |
| Window frame | Context-menu item (per action) | runs the action | the menu is open and `hasContextMenu` | danger items are styled |

### 8.4 Settings

The settings window is the bulk of the count: 106 buttons across 31 components.
Sub-tab rails are one row each, because every tab in a rail shares the same
handler shape and the same active marker.

| Surface | Control | Action | Enabling state | Visible? |
| --- | --- | --- | --- | --- |
| Settings — rail | Tab (8 tabs) | switches the tab | — | yes — `aria-selected` + border marker; no arrow keys (§7 N8) |
| Connections → Accounts | Make active (per account) | switches the active account | account is not active | yes — the card carries an active badge |
| Connections → Accounts | Remove (per account) | removes the account | more than one account exists | **no** — reason lives in a `title` on a disabled button — BUG-0714 |
| Connections → Accounts | Add Bitget / Add Bitunix | adds an account | — | — |
| Connections → Accounts | Reveal key | toggles key visibility | — | — |
| Connections | Sub-tab rail (3: exchanges, data, RSS) | switches the sub-tab | — | yes — active class |
| Connections | Reveal app token / ImgBB key | toggles visibility | — | — |
| Connections | Create access token (two sections) | requests a token | token status is not `loading` | opacity only |
| Connections → RSS | Remove feed (per feed) | removes the feed | — | — |
| Connections → RSS | Add feed | adds a feed | fewer than five feeds | **no** — no counter, no title — BUG-0713 |
| AI | Provider segmented control (Ollama, OpenAI, Gemini, Anthropic, Custom) | selects the built-in provider | — | yes — active class |
| AI | Sub-tab rail (3: intelligence, behaviour, agents) | switches the sub-tab | — | yes — active class |
| AI | Custom providers | opens the provider manager | — | — |
| AI → Behaviour | News open behaviour (4 options) | sets the behaviour | — | yes — check mark |
| AI → Agents | Remove Discord channel (per row) | removes the channel | — | — (no confirmation) |
| AI → Agents | Add Discord channel | appends a row | — | — |
| AI | Model refresh | reloads the model list | not loading | yes — label becomes "testing…" |
| AI → Custom providers | Add provider | appends a provider | — | — |
| AI → Custom providers | Activate (per provider) | makes it active | not already active | yes — label becomes "Active" |
| AI → Custom providers | Delete (per provider) | removes it | — | — (no confirmation) |
| Trading | Sub-tab rail (5: market, chart, risk, paper, audit) | switches the sub-tab | — | yes — active class |
| Trading | Fee preference (maker / taker) | sets the fee assumption | — | yes — active class |
| Trading | PnL view mode (per option) | sets the mode | — | yes — active class |
| Trading → Chart | Manage performance `⚡` | switches to System → Performance | — | **cross-surface** (§8.7) |
| Chart | Reset chart settings | restores chart defaults | — | — (no confirmation) |
| System | Sub-tab rail (5: performance, dashboard, data, maintenance, hotkeys) | switches the sub-tab | — | yes — active class |
| System → Data | Create snapshot | triggers a backup | — | — |
| System → Data | File target: reconnect / choose / clear (four buttons) | rebinds a backup target | — | — |
| System → Data | Backup | writes a backup (asks about encryption) | — | confirmed for the encryption choice |
| System → Maintenance | Clear cache | clears news and market caches | — | — (no confirmation) |
| System → Maintenance | Reload app | reloads the page | — | — (no confirmation) |
| System → Maintenance | Start onboarding tour | starts the app-wide tour after 2 s | — | no state while the tour is pending; a second click restarts the timer |
| System → Maintenance | Factory reset | wipes local data | — | confirmed (`modalState`) |
| System → Hotkeys | Switch to custom | sets `hotkeyMode = "custom"` | — | — |
| System → Hotkeys | Reset to defaults | restores hotkey defaults | — | confirmed (`confirm()`) |
| System → Hotkeys | Edit (per action) | captures a new key | — | — |
| Cloud | Connect | connects to the SpacetimeDB backend | shown only while disconnected | the button's existence is the state |
| Cloud | Erase my messages | erases the user's own chat messages | connected **and** deletion available | yes — explanation paragraph plus a two-step label |
| Cloud | Send | posts a chat message | connected | yes — the input is disabled and the state is printed |
| Automation | Edit bot (per row) | opens the row in edit mode | — | — |
| Automation | Remove bot (per row) | deletes the bot | — | — (no confirmation) |
| Automation | Save / Cancel | commit or discard the edit | — | — |
| Automation | Promote | promotes the stop distance | a source bot is selected | yes — the select is adjacent |
| Visuals | Sub-tab rail (3: appearance, layout, background) | switches the sub-tab | — | yes — active class |
| Visuals → Appearance | Border effect (2) | sets fire or glow | — | yes — active class |
| Visuals → Appearance | Burning-border intensity (3) | sets the intensity | — | yes — active class |
| Visuals → Appearance | Border colour mode (4) | sets the mode | — | yes — active class |
| Visuals → Appearance | Ambient topline mode (3) | sets the mode | — | yes — active class |
| Visuals → Appearance | Ambient topline intensity (3) | sets the intensity | — | yes — active class |
| Visuals → Background | Background type (per type) | sets the background | — | yes — active class |
| Visuals → Background | Reset galaxy / reset trade flow | restores defaults | — | — (no confirmation) |
| Visuals → Background | Flow mode / colour mode (per option) | sets the mode | — | yes — active class |
| Visuals → Layout | News open behaviour (4 options) | sets the behaviour | — | yes — check mark; duplicates the AI tab control |
| Data maintenance | Scan all | scans the journal for gaps | not scanning or repairing | yes — label becomes "scanning" |
| Data maintenance | Repair ATR / MFE-MAE / symbols | rewrites journal fields | the matching gap count is above zero | the button renders only then; no confirmation |
| Risk | Release kill switch | releases the block | — | confirmed (`modalState`) |
| Risk | Engage kill switch | blocks new orders | — | — (the safe direction; no confirmation) |
| Risk | Close all positions | runs the close-all flow | not already closing | opacity only |
| Risk | Reset limits | restores risk limits | — | confirmed (`modalState`) |
| Paper trading | Switch mode | toggles paper/live | — | confirmed (`modalState`) |
| Paper trading | Reset book | empties the paper book | — | confirmed (`modalState`) |
| Paper trading | Failure mode (per option) | sets the simulation mode | — | yes — active class |
| Notifications | Preview tone | plays a test sound | sound is supported | yes — availability text is rendered |
| Notifications | Restore defaults | resets policy and sound | — | — (no confirmation) |
| External channels | Look up chats | resolves Telegram chats | a bot token is present | yes — the token field is adjacent |
| External channels | Clear delivery log | empties the log | — | — (no confirmation) |
| External channel card | Send test | sends a test message | no configuration problem, not testing | yes — the problem text is rendered |
| External channel card | Clear | clears the channel config | — | — (no confirmation) |
| Order audit | Export / Refresh | download or reload the log | — | — |
| Order audit | Clear log | empties the log | — | confirmed (`modalState`) |
| Order audit | Expand row (per entry) | shows the detail | — | — |
| API quota | Reset CryptoPanic / Reset NewsAPI | resets the quota counter | — | confirmed (`confirm()`) |
| Calculation | Preset (per preset) | applies a calculation profile | — | — |
| Calculation | Timeframe toggle (per timeframe) | adds or removes a timeframe | at least two timeframes remain | **no** — the last one stays enabled and does nothing — BUG-0718 |
| Confirmations | Reset policy | restores the confirmation defaults | — | — (no confirmation) |
| Engine debug | Refresh | reloads the debug data | — | — |
| Engine debug | Recent history toggle | expands the history | — | yes — label and `aria` follow the state |
| Indicator settings | Category rail (6) | switches the category | — | yes — active class |
| Indicator settings | Pivot type (per option) | sets the pivot method | — | yes — active class |
| Indicator alert action | Open alert panel | seeds and opens the panel | the indicator is alertable and not refused | yes — `aria-disabled` + `title` (the precedent to copy) |
| Settings entry | `SettingsButton` | opens the settings window | — | **imported by zero components** — dead, like `Button.svelte` (§5) |

### 8.5 Destructive controls, and how each is confirmed

| Control | What is lost | Confirmed? |
| --- | --- | --- |
| `#reset-btn` (header) | every trade-form value except symbol and trade type | yes — `modalState` (BUG-0716) |
| `#delete-preset-btn` (header) | the selected preset | yes — `modalState`, the message names the preset (BUG-0716) |
| Journal → Clear all | the whole journal | yes — `modalState` |
| Journal table → Delete | one trade | yes — `confirm()` |
| System → Factory reset | all local data | yes — `modalState` |
| System → Clear cache | news and market caches | no (low risk) |
| System → Reload app | nothing persisted; the page reloads | no |
| Data maintenance → Repair ×3 | rewrites derived journal fields | no (scoped, but silent) |
| Risk → Release kill switch | the trading block | yes — `modalState` |
| Risk → Engage kill switch | nothing; it is the safe direction | no (deliberate) |
| Risk → Close all | all open positions | yes — `confirmAndCloseAllPositions()` |
| Risk → Reset limits | the configured limits | yes — `modalState` |
| Paper trading → Switch mode / Reset book | the paper book | yes — `modalState` |
| Cloud → Erase my messages | the user's chat messages | yes — two-step inline label |
| Accounts → Remove | the account and its keys | yes — `modalState` |
| Custom providers → Delete | the provider config | **no** |
| Automation → Remove bot | the bot config | **no** |
| Connections → Remove feed | the feed | **no** |
| External channel → Clear | the channel config | **no** |
| AI → Remove Discord channel | the channel row | **no** |
| Chart → Reset chart settings | chart preferences | **no** |
| Visuals → Reset galaxy / trade flow | those settings | **no** |
| Notifications → Restore defaults | notification policy and sound | **no** |
| Confirmations → Reset policy | confirmation policy | **no** |
| Hotkeys → Reset to defaults | hotkey bindings | yes — `confirm()` |
| API quota → Reset | the quota counter | yes — `confirm()` |

The "no" rows are not one class. Engaging the kill switch is the safe direction;
clearing a cache or reloading loses nothing persisted; the "restore defaults"
family is recoverable by reconfiguring, though it is itself inconsistent —
hotkeys confirm, notification policy does not. The header pair was none of
these: form values and a saved preset were gone in one click, next to a theme
switch. BUG-0716 closed that gap; the remaining rows are listed so FEAT-0607
can decide one rule for the family instead of a different one per tab.

### 8.6 The preset trio, checked against each other

| Control | Interaction model | Disabled state | Confirmation |
| --- | --- | --- | --- |
| `#preset-loader` | applies on `change` | never | — |
| `#save-preset-btn` | opens a name prompt | never | the prompt is the gate |
| `#delete-preset-btn` | confirms, naming the preset, then deletes | when nothing is selected | yes — `modalState` |

The trio no longer has the one control that acted without asking: the loader
applies on change, save prompts for a name, delete confirms naming the preset
(BUG-0716). The loader's placeholder option doubles as the empty selection,
which is why the delete button's disabled state is readable at all.

### 8.7 Controls that act on another surface

"Cross-surface" here means the control's visible target lives in another window,
column or overlay, or the control changes which surface is focused. Controls that
change app-wide state (theme, paper mode, factory reset) are not listed — their
effect is the surface they sit on.

| Control | Lives on | Acts on |
| --- | --- | --- |
| Technicals / market overview / activity / sentiment toggles | left rail | the main page's sidebar column and its mobile stack, which may not be rendered |
| Journal restore | left rail | a minimized window |
| Manage performance `⚡` | Settings → Trading → Chart | Settings → System → Performance (switches both tab and sub-tab) |
| Start onboarding tour | Settings → System | closes settings and starts an app-wide overlay |
| Custom providers | Settings → AI | a modal over the settings window |
| Dashboard / Settings / Alerts / Academy / Assistant | left rail | windows and overlays |
| Window header export / delete / open-in-new-tab | window frame | a file, the window's content, or a new browser tab |
| Sync history | journal toolbar | journal data (same window) |

### 8.8 Findings filed from this audit

| Item | Finding |
| --- | --- |
| [BUG-0712](../../bugs/BUG-0712-window-zoom-controls-stay-enabled-at-limits.md) | Zoom and font-size controls never disable at their bounds |
| [BUG-0713](../../bugs/BUG-0713-add-feed-cap-has-no-visible-reason.md) | "Add feed" disables at five with no visible reason |
| [BUG-0714](../../bugs/BUG-0714-account-remove-reason-is-hover-only.md) | Remove-account's disabled reason is hover-only |
| [BUG-0715](../../bugs/BUG-0715-sidebar-toggles-act-on-hidden-surfaces.md) | Rail toggles can stay lit while their panel is not rendered |
| [BUG-0716](../../bugs/BUG-0716-header-destructive-buttons-have-no-confirmation.md) | Header reset and delete-preset act without confirmation |
| [BUG-0717](../../bugs/BUG-0717-window-title-announces-as-a-button-when-it-is-not.md) | The window title has button semantics on windows where it does nothing |
| [BUG-0718](../../bugs/BUG-0718-last-timeframe-toggle-stays-enabled.md) | The last calculation-timeframe toggle stays enabled and silently refuses |
| [BUG-0719](../../bugs/BUG-0719-sync-disables-on-loading-without-a-cue.md) | Journal sync disables on `uiState.isLoading` with no visible reason |

Observations that are not defects on their own, recorded so the button-primitive
work does not rediscover them:

- `SettingsButton.svelte` is imported by zero components — the same shape as the
  dead `Button.svelte` in §5, and a second reason to settle the primitive before
  adopting it.
- The news open behaviour is configured in two places (AI → Behaviour and
  Visuals → Layout) with identical options. One of them should go when the
  settings vocabulary is harmonised (FEAT-0607).
  **Resolved 2026-10-30 ([BUG-0729](../../bugs/BUG-0729-news-open-behaviour-has-two-homes.md)).**
  The AI → Behaviour copy was removed; the setting now renders only in
  Visuals → Layout, under its own heading.
- The theme switcher's backward gesture is a right-click with no affordance.
- Quick-date buttons leave no active marker; the resulting date inputs are the
  only feedback.
- "Save notes" in the trade drawer stays enabled when nothing changed. Harmless
  (the write is idempotent), but a button primitive with a `busy`/`dirty` notion
  would have to decide it.

## 9. Reading this document

Sections 1–6 and 10–11 are measurements. If a number drifts, the number is stale,
not the code. Sections 7's N1–N3 and N9 are the ones that constrain *ordering* rather
than describing state — those are why the token layer precedes the density mode,
and why the density mode precedes the settings reorganisation in execution even
though the settings work is specced first. N4, N8 and N9 were the three open
claims of the original brief; all three are resolved above, and N4's outcome
lives on as [BUG-0696](../../bugs/BUG-0696-settings-window-inherits-an-inert-minwidth.md).

## 10. Settings vocabulary (FEAT-0607)

Recorded 2026-10-22, after FEAT-0613. Every row names the settled term in both
languages; the six renamed terms are in §10.3. Source: `src/locales/locales/{de,en}.json`,
read through the components in `src/components/settings/`.

Scope: `<h3>`/`<h4>` headings and every `<Toggle>` label in that directory, plus the
hotkey-category headings, which are rendered from a key list rather than literal
markup. Four headings rendered by shared components (`PerformanceMonitor`,
`CalculationDashboard`) are outside the scan because they are not settings
controls.

### 10.1 Section headings and labels

**Trading**

| Heading (DE) | Heading (EN) | Key |
| --- | --- | --- |
| Bestätigungen | Confirmations | `settings.confirmations.title` |
| Externe Kanäle | External channels | `settings.externalChannels.title` |
| Benachrichtigungen | Notifications | `settings.notifications.title` |
| Order-Audit | Order audit | `settings.audit.title` |
| Ausführung & Daten | Execution & Data | `settings.trading.executionData` |
| Automatisierung & Erweitert | Automation & Advanced | `settings.trading.automationTitle` |
| Daten & Markt | Data & Market | `settings.trading.chartTitle` |
| Kachel-Aktions-Links | Tile Action Links | `settings.trading.tileActionLinks` |

**Chart**

| Heading (DE) | Heading (EN) | Key |
| --- | --- | --- |
| Skalierung | Price Scale | `settings.chart.scaleSection` |
| Darstellung | Display | `settings.chart.displaySection` |
| Fadenkreuz | Crosshair | `settings.chart.crosshairSection` |
| Zeitachse & Countdown | Time Scale & Countdown | `settings.chart.timeSection` |
| Indikator-Konfiguration | Indicator Configuration | `settings.chart.indicatorConfiguration` |
| Panel-Konfiguration | Panel Configuration | `settings.technicals.panelConfiguration` |
| Sichtbarkeit umschalten | Toggle visibility | `settings.technicals.toggleVisibility` |
| Berechnungs-Engine | Calculation Engine | `settings.technicals.calculationEngine` |
| Darstellung | Display | `settings.technicals.displayPreferences` |
| Favorisierte Zeitrahmen | Favorite Timeframes | `settings.technicals.favorites` |
| Oszillatoren | Oscillators | `settings.technicals.tabs.oscillators` |
| Trend | Trend | `settings.technicals.tabs.trend` |
| Volatilität | Volatility | `settings.technicals.tabs.volatility` |
| Volumen | Volume | `settings.technicals.tabs.volume` |

**AI**

| Heading (DE) | Heading (EN) | Key |
| --- | --- | --- |
| Eigene Provider | Custom providers | `settings.ai.customProviders.title` |
| KI-Core | Intelligence Core | `settings.ai.intelligenceTitle` |
| Verhalten & Persona | Behavior & Persona | `settings.ai.behavior` |
| Autonome Agenten | Autonomous Agents | `settings.ai.agents` |
| Discord Bot | Discord Bot | `settings.ai.discord.title` |

**Connections**

| Heading (DE) | Heading (EN) | Key |
| --- | --- | --- |
| API-Quota-Überwachung | API Quota Monitoring | `settings.apiQuota.title` |
| Börsen | Exchanges | `settings.connections.exchanges` |
| Datendienste | Data Services | `settings.connections.dataServices` |
| RSS Feeds | RSS Feeds | `settings.connections.rss` |
| Eigene Feeds | Custom Feeds | `settings.connections.customFeeds` |

**Automation**

| Heading (DE) | Heading (EN) | Key |
| --- | --- | --- |
| Modus | Mode | `settings.paper.modeTitle` |
| Simulation | Simulation | `settings.paper.simulationTitle` |
| Simulierte Fehler | Simulated failures | `settings.paper.failureTitle` |
| Kill Switch | Kill Switch | `settings.risk.killSwitch.title` |
| Alle Positionen schließen | Close all positions | `settings.risk.closeAll.title` |
| Heute | Today | `settings.risk.dailyStatusTitle` |
| Limits | Limits | `settings.risk.limitsTitle` |
| Deine Bots | Your bots | `settings.automation.yourBots` |
| Alarm hochstufen | Promote an alert | `settings.automation.promoteTitle` |
| Das simulierte Konto | The simulated account | `settings.automation.account` |

**System**

| Heading (DE) | Heading (EN) | Key |
| --- | --- | --- |
| Leistungsprofile | Performance Profiles | `settings.calculation.profiles` |
| Erweiterte Einstellungen | Advanced Settings | `settings.calculation.advanced` |
| Aktuelle Konfiguration | Current Configuration | `settings.calculation.currentConfig` |
| Daten-Wartung | Data Maintenance | `settings.data.title` |
| Berechnungs-Timeframe | Calculation Timeframe | `settings.data.repairTimeframe` |
| Volatilitäts-Matrix (ATR) | Volatility Matrix (ATR) | `settings.data.atrTitle` |
| Exekutions-Metriken (MFE/MAE) | Execution Metrics (MFE/MAE) | `settings.data.mfeMaeTitle` |
| Symbole bereinigen | Clean Symbols | `settings.data.symbolsTitle` |
| ⚡ Engine-Debug-Panel | ⚡ Engine Debug Panel | `settings.system.debug.panelTitle` |
| Performance | Performance | `settings.system.performance` |
| Schnellaktionen | Quick Actions | `settings.system.quickActions` |
| Daten & Backup | Data & Backup | `settings.system.dataMaintenance` |
| Onboarding-Tour starten | Start Onboarding Tour | `settings.system.startOnboardingTour` |
| Gefahrenzone | Danger Zone | `settings.system.dangerZone` |
| Tastenkürzel | Hotkeys | `settings.profile.hotkeysTitle` |
| Favoriten | Favorites | `settings.hotkeys.category.favorites` |
| Trade-Setup | Trade Setup | `settings.hotkeys.category.tradeSetup` |
| UI & Navigation | UI & Navigation | `settings.hotkeys.category.uiNavigation` |
| Marktdaten | Market Data | `settings.hotkeys.category.marketData` |
| System | System | `settings.hotkeys.category.system` |

**Visuals**

| Heading (DE) | Heading (EN) | Key |
| --- | --- | --- |
| Galaxie (3D) | Galaxy (3D) | `settings.visuals.bgGalaxy` |
| Trade-Flow-Konfiguration | Trade Flow Configuration | `settings.visuals.tradeFlow.config` |
| Fluss | Flow | `settings.visuals.tradeFlow.flow` |
| Indikatoren | Indicators | `settings.visuals.tradeFlow.indicators` |
| Rasterlayout | Grid Layout | `settings.visuals.tradeFlow.gridLayout` |
| Galaxie | Galaxy | `settings.visuals.tradeFlow.galaxySection` |
| Marktkopplung | Market Coupling | `settings.visuals.tradeFlow.marketCoupling` |
| Kamerasteuerung | Camera Control | `settings.visuals.tradeFlow.cameraControl` |
| Minimierter Fenster-Dock | Minimized window dock | `settings.dockingTitle` |

**Cloud**

| Heading (DE) | Heading (EN) | Key |
| --- | --- | --- |
| Community Cloud (Beta) | Community Cloud (Beta) | `cloud.title` |

_72 rows._

### 10.2 Toggle labels

Label = the visible text of the control; hint and description keys (`…Desc`) are
not part of the table.

**Trading**

| Label (DE) | Label (EN) | Key |
| --- | --- | --- |
| Noch nicht verfügbar — für diese Aktion gibt es keinen Bestätigungsdialog; einschalten würde sie blockieren. | Not available yet — this action has no confirmation dialog, so switching it on would block it. | `settings.confirmations.notWired` |
| Kanal aktiv | Channel active | `settings.externalChannels.enable` |
| Erst unten einrichten | Set this up below first | `settings.notifications.channelNeedsSetup` |
| Stumm | Mute | `settings.notifications.soundMute` |
| Paper Trades im Journal speichern | Save paper trades to the journal | `settings.trading.journalPaperTrades` |
| Eingaben mit Live-Preis synchronisieren | Sync inputs with live price | `settings.trading.syncPrice` |
| Guthaben beim Laden abrufen | Auto-fetch Balance | `settings.autoFetchBalance` |
| Löschen bestätigen | Confirm Trade Deletion | `settings.trading.confirmDelete` |
| Massenlöschung bestätigen | Confirm Bulk Deletion | `settings.trading.confirmBulkDelete` |
| Veralteten Preis mit Badge zeigen | Show stale price with badge | `settings.stalePriceBadge` |
| Nur ausgeführte Orders anzeigen | Hide Unfilled Orders | `settings.hideUnfilledOrders` |
| Automatisierter Handel (Beta) | Auto Trading (Beta) | `settings.trading.autoTrading` |
| Multi-Account-Verwaltung | Multi-Account Management | `settings.trading.multiAccount` |
| Marktübersicht Kacheln | Market Overview Tiles | `settings.trading.marketTiles` |
| Links-Footer anzeigen | Show Links Footer | `settings.trading.showLinks` |
| Stimmungsanalyse-Panel anzeigen | Show sentiment analysis panel | `settings.trading.showSentimentAnalysis` |
| Sidebar-Aktivität anzeigen | Show Sidebar Activity | `settings.showSidebarActivity` |
| Technische Analyse-Panel anzeigen | Show technical analysis panel | `settings.trading.showTechnicalAnalysis` |
| Automatische Preisaktualisierung (Eingabefeld) | Auto-update Price Input | `settings.autoUpdatePriceInput` |
| Marktstimmung | Market Sentiment | `settings.trading.marketSentiment` |
| Marktaktivität | Market Activity | `dashboard.marketActivity` |
| Technicals-Panel anzeigen | Show Technicals Panel | `settings.showTechnicals` |

**Chart**

| Label (DE) | Label (EN) | Key |
| --- | --- | --- |
| Auto-Skalierung | Auto Scaling | `settings.chart.autoScale` |
| Achse invertieren | Invert Scale | `settings.chart.invertScale` |
| Gitterlinien | Grid Lines | `settings.chart.showGrid` |
| Kerzenrahmen | Candle Borders | `settings.chart.candleBorders` |
| Aktuelle-Preis-Label | Last Price Label | `settings.chart.lastValueVisible` |
| Wasserzeichen | Watermark | `settings.chart.watermark` |
| Sekunden anzeigen | Show Seconds | `settings.chart.secondsVisible` |
| Ränder fixieren | Fix Edges | `settings.chart.fixEdges` |
| Countdown zur Kerzenschließung | Candle Close Countdown | `settings.chart.countdownEnabled` |
| Zusammenfassung | Summary | `settings.technicals.summary` |
| Oszillatoren | Oscillators | `settings.technicals.oscillatorsTitle` |
| Gleitende Durchschnitte | Moving Averages | `settings.technicals.movingAveragesTitle` |
| Pivot-Punkte | Pivot Points | `settings.technicals.pivotsTitle` |
| Markt Konfluenz | Market Confluence | `settings.technicals.marketConfluence` |
| Volatilität | Volatility | `settings.technicals.tabs.volatility` |
| Erweitert | Advanced | `settings.technicals.advancedTitle` |
| Signale | Signals | `settings.technicals.signals` |
| Volle Höhe | Full height | `settings.technicals.fullHeight` |
| RSI-Timeframe synchronisieren | Synchronize RSI Timeframe | `settings.technicals.syncRsi` |
| Signallinie anzeigen | Show Signal Line | `settings.technicals.rsi.showSignal` |
| RSI | RSI | `settings.technicals.rsi.title` |
| Stoch RSI | Stoch RSI | `settings.technicals.stochRsi.title` |
| Stochastik | Stochastic | `settings.technicals.stochasticTitle` |
| Williams %R | Williams %R | `settings.technicals.williamsR` |
| CCI | CCI | `settings.technicals.cci` |
| Momentum | Momentum | `settings.technicals.momentum` |
| Awesome Osc. | Awesome Osc. | `settings.technicals.awesomeOsc` |
| MFI | MFI | `settings.technicals.mfi` |
| MACD | MACD | `settings.technicals.macd.title` |
| ADX | ADX | `settings.technicals.adx` |
| SuperTrend | SuperTrend | `settings.technicals.superTrend.title` |
| Ichimoku | Ichimoku | `settings.technicals.ichimoku` |
| Parabolic SAR | Parabolic SAR | `settings.technicals.parabolicSar` |
| EMA | EMA | `settings.technicals.emaTitle` |
| SMA | SMA | `settings.technicals.smaTitle` |
| WMA | WMA | `settings.technicals.wma` |
| VWMA | VWMA | `settings.technicals.vwma` |
| HMA | HMA | `settings.technicals.hma` |
| Bollinger Bänder | Bollinger Bands | `settings.technicals.bollingerBands.title` |
| Choppiness Idx | Choppiness Idx | `settings.technicals.choppiness` |
| ATR Trailing Stop | ATR Trailing Stop | `settings.technicals.atrStop.title` |
| Volumen | Volume | `settings.technicals.volume` |
| OBV | OBV | `settings.technicals.obv` |
| VWAP | VWAP | `settings.technicals.vwap` |

**AI**

| Label (DE) | Label (EN) | Key |
| --- | --- | --- |
| Trading-Kontext teilen (Journal, Positionen & Setup) | Share Trading Context (Journal, Positions & Setup) | `settings.ai.shareTradeContext` |
| News-Analyse aktivieren | Enable News Analysis | `settings.enableNewsAnalysis` |
| CMC-Kontext aktivieren | Enable CMC Context | `settings.enableCmcContext` |
| Aktionen bestätigen | Confirm Actions | `settings.ai.confirmActions` |
| Einstellungen ändern | Allow Settings Changes | `settings.ai.allowSettingsChanges` |
| Verlauf löschen bestätigen | Confirm Clear History | `settings.ai.confirmClearHistory` |

**System**

| Label (DE) | Label (EN) | Key |
| --- | --- | --- |
| Netzwerk-Logs | Network Logs | `settings.system.networkLogs` |
| Debug Modus | Debug Mode | `settings.system.debugMode` |
| Nutzungsstatistiken | Usage Statistics | `settings.system.telemetry` |
| Vermeide die Übersetzung von Fachwörtern | Avoid translating technical words | `settings.system.avoidTranslating` |
| Englische Fachbegriffe | English Technical Terms | `settings.system.englishTechnicalTerms` |

**Visuals**

| Label (DE) | Label (EN) | Key |
| --- | --- | --- |
| Tooltips anzeigen | Show Tooltips | `settings.showTooltips` |
| Glassmorphismus aktivieren | Enable Glassmorphism | `settings.enableGlassmorphism` |
| Brennende Ränder | Burning Borders | `settings.visuals.burningBorders` |
| Marktübersicht Kacheln | Market Overview Tiles | `settings.appearance.burnMarketOverview` |
| Flash Cards | Flash Cards | `settings.appearance.burnFlashCards` |
| Chart Fenster | Chart Windows | `settings.appearance.burnCharts` |
| Modale & Dialoge | Modals & Dialogs | `settings.appearance.burnModals` |
| Kanäle & Feeds | Channels & Feeds | `settings.appearance.burnChannels` |
| Trade Journal | Trade Journal | `settings.appearance.burnJournal` |
| Sentiment Topline | Sentiment Topline | `settings.appearance.ambientTopline` |
| Trade-Impulse (Bursts) | Trade Bursts | `settings.appearance.ambientToplineBursts` |
| Auto-Zentrierung | Auto-Center | `settings.visuals.autoCenter` |
| Gyroskop Steuerung | Gyroscope Control | `settings.visuals.gyroscope` |
| Die Szene liest zwei Marktsignale: Stimmung (rollierendes Kauf-/Verkaufsverhältnis oder RSI) und Aktivität (Trade-Rate, Volumen, Volatilität/ATR). Die Stimmung färbt Hintergrund, Lichter und Himmel grün (bullisch) bzw. rot (bärisch); Aktivität hellt auf und verdichtet Nebel und Fog. Ruhiger Markt bleibt dunkel und still, lebhafter Markt wird lebendig. Ausschalten setzt die Szene auf einen neutralen, ruhigen Zustand zurück. | The scene reads two market signals: mood (rolling buy/sell ratio or RSI) and activity (trade rate, volume, volatility/ATR). Mood tints the background, lights and sky green (bullish) or red (bearish); activity brightens them and thickens the fog and nebula. A calm market stays dark and still, a busy one comes alive. Turning it off returns the scene to a neutral, quiet state. | `settings.visuals.tradeFlow.tooltipDynamicAtmosphere` |
| Langsame, rein dekorative Drehung der Szene. Standardmäßig aus: Die Drehung macht die Zeit- (Tiefe) und Preisachsen (Höhe) unlesbar. | Slow, purely decorative spin of the scene. Off by default: rotation makes the time (depth) and price (height) axes unreadable. | `settings.visuals.tradeFlow.tooltipRotation` |
| Macht den Radius der Scheibe zur Preisskala: Die Schockwelle eines Trades beginnt dort, wo dieser Trade in der jüngsten Preisspanne liegt — kernnah am unteren Ende, randnah am oberen — und Käufe laufen nach außen, Verkäufe nach innen. Aus: Jede Welle startet im Kern, der Radius trägt keine Bedeutung. | Turns the disc's radius into a price scale: a trade's shockwave starts where that trade sits in the recent price range — near the core at the bottom of the range, near the rim at the top — and buys sweep outward while sells sweep inward. Off: every wave starts at the core and radius carries no meaning. | `settings.visuals.tradeFlow.tooltipPriceAxis` |
| Zeichnet drei Ringe auf die Preisachse: den zuletzt gehandelten Preis und ±1 ATR darum. So ist auf einen Blick erkennbar, ob die Schockwelle eines Trades innerhalb der normalen Marktspanne liegt oder daraus ausbricht. Benötigt die radiale Preisachse und einen verfügbaren ATR-Wert; mit der 2× ATR-Achsenspanne sitzen ±1 ATR-Ringe nahe den 1/4- und 3/4-Positionen, bewegen sich nur, wenn der Preis um 1+ ATR von der aktuellen Mitte abweicht — was selbst schon die Antwort ist. | Draws three rings on the price axis: the last traded price, and ±1 ATR around it. Lets you see at a glance whether a trade's shockwave sits inside the market's normal range or is breaking out of it. Needs the radial price axis and an available ATR reading; with the 2× ATR axis span, ±1 ATR rings sit near the 1/4 and 3/4 points, moving only if price wanders 1+ ATR from the recent centre — which is itself the answer. | `settings.visuals.tradeFlow.tooltipAtrBands` |
| Seitenleisten anzeigen (Tabelle & Kacheln) | Show Sidebars | `settings.showSidebars` |
| Markt-Chat | Market Chat | `settings.workspace.marketChat` |
| Dock zentrieren | Center the dock | `settings.dockingCentered` |
| Dynamische Atmosphäre | Dynamic Atmosphere | `settings.visuals.tradeFlow.dynamicAtmosphere` |
| Szenenrotation | Scene rotation | `settings.visuals.tradeFlow.sceneRotation` |
| Radiale Preisachse | Radial price axis | `settings.visuals.tradeFlow.priceAxis` |
| ATR-Referenzringe | ATR reference rings | `settings.visuals.tradeFlow.atrBands` |
| Side Panel (KI/Notizen) aktivieren | Enable Side Panel (AI/Notes) | `settings.enableSidePanel` |

_102 rows._

### 10.3 Renamed terms

| Before (DE) | After (DE) | Before (EN) | After (EN) | Why |
| --- | --- | --- | --- | --- |
| Order-Audit-Trail | Order-Audit | Order audit trail | Order audit | Four names for one screen (key `audit`, sub-tab “Order-Log”, heading “Audit-Trail”); “trail” is jargon. |
| Order-Log | Order-Audit | Order Log | Order Audit | The same screen as above; one name. |
| Anzeigeeinstellungen | Darstellung | Display Preferences | Display | It sat next to “Darstellung” in the chart tab: two words for one concept. |
| Kill Switch | Kill Switch | Kill switch | Kill Switch | Product name in the heading; running text keeps sentence case. |
| API Quota Überwachung | API-Quota-Überwachung | API Quota Monitoring | API Quota Monitoring | German compounds in this window are hyphenated. |
| Trade Flow Konfiguration | Trade-Flow-Konfiguration | Trade Flow Configuration | Trade Flow Configuration | Same rule; “Trade Flow” stays the product name. |

One key changed namespace without changing its text:
`settings.trading.indicatorConfiguration` → `settings.chart.indicatorConfiguration`.
The heading has been rendered by the chart tab since the indicator settings moved;
the key still named the tab it came from. Its dead `|| "Indicator Configuration"`
fallback went with it. The rule is the product area, not the rendering tab: a key
may keep an area name that no longer matches a tab (`profile.hotkeysTitle` is the
known legacy case, and is not renamed here).

### 10.4 Tab and sub-tab labels

The eight rail tabs and every sub-tab row, both from the locale files.

| Label (DE) | Label (EN) | Key |
| --- | --- | --- |
| Handel & Markt | Trading & Market | `settings.tabs.trading` |
| Automation | Automation | `settings.tabs.automation` |
| Chart | Chart | `settings.tabs.chart` |
| Optik & Design | Visuals & Design | `settings.tabs.visuals` |
| KI Chat | AI Chat | `settings.tabs.ai` |
| Verbindungen | Connections | `settings.tabs.connections` |
| System | System | `settings.tabs.system` |
| Cloud | Cloud | `settings.tabs.cloud` |

**Trading**

| Handelsbereiche | Trading sections | `settings.trading.subTabLabel` |
| Exekution & Gebühren | Execution & Fees | `settings.trading.executionTitle` |
| Daten & Markt | Data & Market | `settings.trading.chartTitle` |
| Risiko & Kill Switch | Risk & Kill Switch | `settings.risk.subTab` |
| Paper Trading | Paper Trading | `settings.paper.subTab` |
| Order-Audit | Order Audit | `settings.audit.subTab` |

**AI**

| KI-Bereiche | AI sections | `settings.ai.subTabLabel` |
| KI-Assistent | AI Assistant | `settings.tabs.ai_assistant` |
| Verhalten & Persona | Behavior & Persona | `settings.ai.behavior` |
| Autonome Agenten | Autonomous Agents | `settings.ai.agents` |

**Connections**

| Verbindungsbereiche | Connection sections | `settings.connections.subTabLabel` |
| Verbindungen | Connections | `settings.tabs.connections` |
| Integrationen | Integrations | `settings.tabs.integrations` |
| RSS Feeds | RSS Feeds | `settings.connections.rss` |

**System**

| Systembereiche | System sections | `settings.system.subTabLabel` |
| Performance | Performance | `settings.system.performance` |
| Dashboard | Dashboard | `settings.system.dashboard` |
| Daten & Backup | Data & Backup | `settings.system.dataMaintenance` |
| Wartung | Maintenance | `settings.tabs.maintenance` |
| Tastenkürzel | Hotkeys | `settings.profile.hotkeysTitle` |

**Visuals**

| Unterbereiche | Sub-sections | `settings.visuals.subtabs.label` |
| Optik & Design | Look & Feel | `settings.visuals.subtabs.appearance` |
| Layout | Layout | `settings.visuals.subtabs.layout` |
| Hintergrund | Background | `settings.visuals.subtabs.background` |

**Technicals**

| Indikatorbereiche | Indicator sections | `settings.technicals.subTabLabel` |
| Allgemein | General | `settings.technicals.tabs.general` |
| Oszillatoren | Oscillators | `settings.technicals.tabs.oscillators` |
| Trend | Trend | `settings.technicals.tabs.trend` |
| Volatilität | Volatility | `settings.technicals.tabs.volatility` |
| Volumen | Volume | `settings.technicals.tabs.volume` |
| Chart | Chart | `settings.technicals.tabs.chart` |

### 10.5 Verification

Assembled by hand from the components and cross-checked against both locale
files; there is no generator. `npm run i18n:types` proves key parity, and the
`settingsTabs.test.ts` suite pins the six tab lists, so a label that exists in
only one language fails before it can reach this table.

## 11. Settings placement (FEAT-0607)

Expected tab follows the rule: a section belongs to the tab whose sub-tab owns
the noun it configures. The Match column compares the rendered tab with that
rule.

| Section (DE) | Rendered in | Expected | Match | Note |
| --- | --- | --- | --- | --- |
| Eigene Provider | AI | AI | match | — |
| API-Quota-Überwachung | Connections | Connections | match | — |
| Leistungsprofile | System | System | match | — |
| Erweiterte Einstellungen | System | System | match | — |
| Aktuelle Konfiguration | System | System | match | — |
| Bestätigungen | Trading | Trading | match | Grouped under Risk by FEAT-0024. |
| Daten-Wartung | System | System | match | — |
| Berechnungs-Timeframe | System | System | match | — |
| Volatilitäts-Matrix (ATR) | System | System | match | — |
| Exekutions-Metriken (MFE/MAE) | System | System | match | — |
| Symbole bereinigen | System | System | match | — |
| ⚡ Engine-Debug-Panel | System | System | match | — |
| Externe Kanäle | Trading | Trading | match | Grouped under Risk by FEAT-0025. |
| Benachrichtigungen | Trading | Trading | match | Grouped under Risk by FEAT-0025. |
| Order-Audit | Trading | Trading | match | — |
| Modus | Automation, Trading | Automation | match (reuse) | Reused by Automation for the simulated account. |
| Simulation | Automation, Trading | Automation | match (reuse) | Reused by Automation for the simulated account. |
| Simulierte Fehler | Automation, Trading | Automation | match (reuse) | Reused by Automation for the simulated account. |
| Kill Switch | Automation, Trading | Automation | match (reuse) | Reused by Automation for the simulated account; the comment in `AutomationTab` explains why a copy would be worse. |
| Alle Positionen schließen | Automation, Trading | Automation | match (reuse) | Reused by Automation for the simulated account; the comment in `AutomationTab` explains why a copy would be worse. |
| Heute | Automation, Trading | Automation | match (reuse) | Reused by Automation for the simulated account; the comment in `AutomationTab` explains why a copy would be worse. |
| Limits | Automation, Trading | Automation | match (reuse) | Reused by Automation for the simulated account; the comment in `AutomationTab` explains why a copy would be worse. |
| KI-Core | AI | AI | match | — |
| Verhalten & Persona | AI | AI | match | — |
| Autonome Agenten | AI | AI | match | — |
| Discord Bot | AI | AI | match | — |
| Deine Bots | Automation | Automation | match | — |
| Alarm hochstufen | Automation | Automation | match | — |
| Das simulierte Konto | Automation | Automation | match | — |
| Skalierung | Chart | Chart | match | — |
| Darstellung | Chart | Chart | match | — |
| Fadenkreuz | Chart | Chart | match | — |
| Zeitachse & Countdown | Chart | Chart | match | — |
| Indikator-Konfiguration | Chart | Chart | match | — |
| Community Cloud (Beta) | Cloud | Cloud | match | — |
| Börsen | Connections | Connections | match | — |
| Datendienste | Connections | Connections | match | — |
| RSS Feeds | Connections | Connections | match | — |
| Eigene Feeds | Connections | Connections | match | — |
| Panel-Konfiguration | Chart | Chart | match | — |
| Sichtbarkeit umschalten | Chart | Chart | match | — |
| Berechnungs-Engine | Chart | Chart | match | — |
| Darstellung | Chart | Chart | match | — |
| Favorisierte Zeitrahmen | Chart | Chart | match | — |
| Oszillatoren | Chart | Chart | match | — |
| Trend | Chart | Chart | match | — |
| Volatilität | Chart | Chart | match | — |
| Volumen | Chart | Chart | match | — |
| Performance | System | System | match | — |
| Schnellaktionen | System | System | match | — |
| Daten & Backup | System | System | match | — |
| Onboarding-Tour starten | System | System | match | — |
| Gefahrenzone | System | System | match | — |
| Tastenkürzel | System | System | match | — |
| Ausführung & Daten | Trading | Trading | match | — |
| Automatisierung & Erweitert | Trading | Trading | match | — |
| Daten & Markt | Trading | Trading | match | — |
| Kachel-Aktions-Links | Trading | Trading | match | — |
| Galaxie (3D) | Visuals | Visuals | match | — |
| Trade-Flow-Konfiguration | Visuals | Visuals | match | — |
| Fluss | Visuals | Visuals | match | — |
| Indikatoren | Visuals | Visuals | match | — |
| Rasterlayout | Visuals | Visuals | match | — |
| Galaxie | Visuals | Visuals | match | — |
| Marktkopplung | Visuals | Visuals | match | — |
| Kamerasteuerung | Visuals | Visuals | match | — |
| Minimierter Fenster-Dock | Visuals | Visuals | match | — |
| Favoriten | System | System | match | — |
| Trade-Setup | System | System | match | — |
| UI & Navigation | System | System | match | — |
| Marktdaten | System | System | match | — |
| System | System | System | match | — |

**Settings without a heading.** `settings.newsOpenBehavior` is rendered twice:
AI → Behaviour (`AiTab.svelte:343`) and Visuals → Layout (`VisualsLayout.svelte:32`,
without a section heading). That is one setting with two homes and no owner; §8.8
already flagged it. Filed as
[BUG-0729](../../bugs/BUG-0729-news-open-behaviour-has-two-homes.md).

**Result.** Every section with a heading matches the rule. The only mismatches are
the header-less duplicate above and the three documented reuses, none of which is a
pure move. No control was moved in this item.

**Superseded 2026-10-30
([BUG-0729](../../bugs/BUG-0729-news-open-behaviour-has-two-homes.md)).** The
duplicate described in this section was removed: the control now renders only
in Visuals → Layout, under its own heading. Everything above is the measurement
as recorded on 2026-10-22 and is not rewritten, including the Result line about
the header-less duplicate.
