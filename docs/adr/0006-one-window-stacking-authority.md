# ADR-0006: Every overlay goes through the window manager, and there is one stacking authority

- **Status:** Proposed
- **Date:** 2026-08-04
- **Deciders:** pheinze82

## Context

Cachy renders floating surfaces through five independent systems that do not
know about each other.

| System | Drag implementation | Stacking base | Used by |
| --- | --- | --- | --- |
| `WindowManager` + `WindowBase` + `WindowFrame` | Pointer Events, own code | `BASE_Z_INDEX = 11000`, dock `12000`, maximized `20000` | chart, news, guide, changelog, privacy, whitepaper, journal, assistant, settings, symbolpicker, dialog |
| `ModalFrame.svelte` | none — fixed centre overlay | `10000` (`ModalFrame.svelte:154`) | `AcademyModal`, `MarketDashboardModal`, `TpSlEditModal` |
| `floatingWindowsStore` + `SidePanel.svelte` | **interactjs** (`SidePanel.svelte:100-190`) | `1000` (`floatingWindows.svelte.ts:23`) | SidePanel — **not currently reachable from any route**, see below |
| `FlashCard.svelte` | none — fixed overlay | `200` (`FlashCard.svelte:73`) | quiz |
| `modalState` (`stores/modal.svelte.ts`) | renders through `DialogWindow` | inherits window manager | `uiManager.showReadme()` |

Around them sit hand-picked values with no shared origin: `PositionsSidebar`
`10000`, `ToastContainer` `10000`, `+layout.svelte` `10000`, `FXOverlay`
`99999`, `ChartPatternChart` tooltip `9999`.

The consequences are already visible in the product, not hypothetical:

- The quiz card (`200`) renders **behind** every window (`11000`) and every
  modal (`10000`). Opening it while any window is open produces a dimmed screen
  with no card.
- Toasts (`10000`) and modals (`10000`) tie, and source order decides.

A fourth data point turned up while starting the SidePanel migration below:
`SidePanel.svelte` is not imported by any route, layout or component —
`grep -rln "from.*SidePanel" src` returns nothing. Its stacking counter
(`floatingWindowsStore.nextZIndex` starting at `1000`,
`SidePanel.svelte:36-40`) genuinely cannot reach the window layer, but no user
experiences that today, because the component that would suffer from it is
never mounted. The "Enable Side Panel" setting
(`settingsState.enableSidePanel`, guarding `SidePanel.svelte:267`) has been
silently inert for at least as long as the file's git history shows only
mechanical refactors touching it. See
[`BUG-0051`](../backlog/bugs/BUG-0051-sidepanel-never-rendered.md). This ADR's
decision to route every floating surface through one authority does not depend
on which way that bug resolves — if the panel is retired instead of restored,
its row above simply drops out of the table — but the migration item
([`FEAT-0046`](../backlog/features/FEAT-0046-sidepanel-onto-window-manager.md))
is blocked on the decision.
- `.window-frame.maximized { z-index: 20000 !important; }`
  (`WindowFrame.svelte:713`) overrides the reactive `style:z-index={win.zIndex}`
  bind, so `WindowManager.bringToFront()` has no effect between two maximized
  windows.

The duplication costs more than stacking. Behaviour that exists once in
`WindowFrame` — Escape handling, viewport clamping, glassmorphism, the mobile
edge-to-edge rule, geometry persistence — has to be re-implemented, or is
simply missing, in the other four. `AcademyModal` has no title bar, no drag, no
minimise and no persistence for that reason alone. Its mobile fullscreen
behaviour is opted into by passing the CSS utility class
`modal-size-instructions` (`AcademyModal.svelte:46`); `MarketDashboardModal`
does not pass it (`MarketDashboardModal.svelte:155-159`) and therefore behaves
differently on the same phone. The rule lives in a class name a caller has to
remember instead of in a window property.

Arguing against this decision: `ModalFrame` and `FlashCard` are small and work
on desktop, `interactjs` is a maintained library, and routing everything
through one manager makes that manager a single point of failure for surfaces
that currently fail independently. The window manager also has **no test
coverage at all** today, which makes it a risky thing to put more weight on.

## Decision

**One stacking authority.** All z-index values for floating surfaces come from
a single set of CSS custom properties defined in one file. No component
hard-codes a numeric z-index for a floating surface. The layers are ordered
once, and a surface names its layer rather than picking a number.

**One drag implementation.** Dragging and resizing a floating surface happens
in `WindowFrame.svelte` via Pointer Events. `interactjs` is removed as a
dependency.

**One lifecycle.** Every floating surface — window, modal, dialog, side panel,
quiz card — is a `WindowBase` instance owned by `WindowManager`. `ModalFrame`
survives as an adapter that renders a `WindowFrame` underneath, so its three
call sites keep their current props; it does not survive as a second
implementation.

**Responsive behaviour is a window property, not a CSS class.** Whether a
surface goes edge-to-edge below a breakpoint is decided by `isResponsive` and
`edgeToEdgeBreakpoint` in `WindowRegistry`. A caller must not be able to change
a window's mobile layout by passing a utility class.

Applies to floating surfaces only. Inline UI that is part of page flow —
tooltips anchored to a control, dropdown menus, the visual bar — is out of
scope and keeps its local stacking.

## Consequences

### What this enables

- A surface added tomorrow gets Escape, viewport clamping, glassmorphism, the
  mobile rule, focus and persistence by existing, not by re-implementation.
- `bringToFront()` becomes true for everything, because everything shares one
  counter.
- The Academy and the Market Dashboard become consistent on mobile without
  either of them containing layout code for it.
- One `interactjs` dependency and one parallel store (`floatingWindows.svelte.ts`)
  leave the tree.

### What this costs

`WindowFrame.svelte` is already 1146 lines and this makes it carry more cases.
Every regression in it now reaches every surface at once — a bug that used to
break the SidePanel alone can break the Academy, the quiz and the Market
Dashboard together. That price is only acceptable with test coverage under it,
which is why [`FEAT-0050`](../backlog/features/FEAT-0050-window-manager-test-coverage.md)
is not optional follow-up work but part of the same decision.

The migration also touches the persistence format: surfaces that stored nothing
start writing `cachy_win_<id>` entries, and `localStorage` may hold keys from
before the type narrowing (`WindowFrame.svelte:351-378` already documents one
such case). Restoring state must tolerate values the current types no longer
allow.

### What is now forbidden

- A numeric z-index literal on a floating surface, in a component `<style>`
  block or a Tailwind `z-[…]` class. Reviewers can grep for both.
- A second drag or resize implementation, including a new library.
- A floating surface that renders its own fixed overlay instead of registering
  with `WindowManager`.
- Deciding a window's mobile layout from a class name passed by the caller.

## Alternatives considered

**Fix the numbers, keep the systems.** Assign each of the five systems a
non-overlapping z-index range and stop. Cheapest, and it fixes the quiz and the
SidePanel today. Rejected because it fixes nothing else: the Academy still has
no title bar, the mobile rule still lives in a utility class, and the next
surface still picks one of five ways to exist.

**Delete `ModalFrame` outright and register `academy`, `marketdashboard` and
`tpsledit` as window types in one change.** Cleaner endpoint, same endpoint.
Rejected as a first step because it rewrites three call sites simultaneously in
a subsystem with no tests. The adapter reaches the same place with a diff that
can be reverted per call site.

**Adopt a third-party window manager library.** Rejected: the geometry, focus
and persistence model in `WindowBase` already fits the product, and a library
would have to be taught the glassmorphism, burning-borders and theming rules
that are specific to Cachy.
