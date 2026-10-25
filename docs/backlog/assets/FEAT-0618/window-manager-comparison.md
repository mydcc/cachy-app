# FEAT-0618 — Window-manager comparison

**Reference named by the user in session:** KDE KWin, the KDE Plasma window
manager (Plasma 6 documentation), chosen on 2026-10-25. The item text itself
names no product; this asset records the choice so the comparison is
reproducible.

**Method.** Read the current KDE user documentation for Window Behavior,
Window Rules, Screen Edges, common keyboard shortcuts and KWin scripting.
Behaviour is described here; no foreign code is copied. Cachy facts come from
`src/lib/windows/` and the surfaces listed in the item. Browser limitations are
stated as such instead of being silently folded into “defer”.

**Verdicts.** `adopt` = worth having in Cachy (some are already present);
`defer` = valid but outside current scope, with the condition that reopens it;
`browser-impossible` = depends on the OS compositor/desktop and cannot be
reached from a web app. “Already” means the current code already has it.

## Comparison

| # | Feature | KWin behaviour | Cachy today | Verdict |
| --- | --- | --- | --- | --- |
| 1 | Click-to-focus and raise | Click makes a window active; raising is configurable separately (click/hover) | `WindowFrame` raises on pointer down and on focusin; one focused window at a time | **adopt — already** |
| 2 | Focus follows mouse | Six activation policies, including sloppy and strict under-mouse, with configurable delay | Click-to-focus only | **defer** — reopen if hover focus is requested and scroll/touch conflicts are resolved |
| 3 | Focus-stealing prevention | None/Low/Medium/High/Extreme; a prevented window is marked as demanding attention | New windows come to the front; there is no policy | **defer** — reopen when a window can appear without a user gesture (async alert, reminder) |
| 4 | Keep above / below | Per-window stacking flags, also available through rules | z-order and raise-to-front only; no keep-above | **defer** — reopen when a calculator or journal must stay visible over another window; implement as a per-window flag |
| 5 | Maximize and restore | Full, horizontal and vertical maximize | Full maximize/restore with stored floating geometry | **adopt — already** |
| 6 | Minimize and taskbar/dock | Minimize to task manager or panel | Minimize to the in-app docking panel; restore from dock | **adopt — already** |
| 7 | Move and resize | Drag, resize, keyboard move/resize | Pointer drag and eight resize handles | **adopt — already** |
| 8 | Quick tiling at screen edges | Half and quarter tiling from edges/corners, with configurable trigger area | Half tiling left/right and a 48 px magnetic threshold (FEAT-0616); no quarters/corners | **adopt — left/right already; defer quarters** — reopen when quadrant layouts are requested and top/bottom collision with the shell is defined |
| 9 | Snap to other windows and screen centre | Snap zones for screen edges, other windows and the centre | Screen-edge snapping only | **defer** — reopen when several floating windows are routinely open and a window-to-window collision model exists |
| 10 | Window rules | Match by window properties; set position, size, maximize, desktop, screen, fullscreen, shading, keep-above, opacity, focus policy, shortcuts, skip taskbar/pager/switcher, window type and more | Per-window-type config flags plus persisted geometry; no user-defined rules | **defer** — reopen when persistence beyond one geometry is requested; start with position/size/pin, not arbitrary attributes |
| 11 | Per-window shortcut | A rule can assign a shortcut to a matching window | No per-window shortcut; window shortcuts are the browser's | **defer** — reopen when Settings → Controls owns a shortcut editor and conflict handling is defined |
| 12 | Virtual desktops / activities | Multiple desktops and activities with per-window assignment | One viewport; no workspace model | **browser-impossible** — there is no OS workspace API; simulated spaces would be a separate workspace feature, not WM parity |
| 13 | Multi-monitor placement | Place a window on a chosen screen; separate screen focus | One browser viewport; in-app windows cannot be assigned to a physical monitor | **browser-impossible** — the Window Management API is permission-gated and does not place in-app windows |
| 14 | Window tabbing / grouping | Autogroup by identity or explicit ID; tabbed windows | No grouping; most window types are singletons | **defer** — reopen when same-type multi-instance windows are supported and a tab host is designed |
| 15 | Shading / roll-up | Collapse to the titlebar, with optional unshade on hover | Minimize to the dock is the compact state | **defer** — reopen only if a titlebar-only mode is requested; the dock already covers the space-saving use case |
| 16 | Per-window opacity | Active/inactive opacity, also via rules | Per-window `opacity` persisted in the window snapshot | **adopt — already** |
| 17 | Placement policies | Minimal overlap, centered, under mouse, random, top-left, maximized, remember app position | Config layout, stagger and centre; viewport clamping for opted-in windows | **adopt — already** (extra policies are optional) |
| 18 | Session restore | Restores the window set and positions after login | Session-storage window list plus per-window `localStorage` geometry | **adopt — already** |
| 19 | Window switcher (Alt+Tab equivalent) | Task switcher with thumbnails and keyboard traversal | Dock lists minimized windows; no keyboard switcher between open windows | **adopt — next candidate** — the dock is pointer-oriented and a keyboard user cannot cycle open windows |
| 20 | Global hot corners / screen-edge actions | Configurable corners and edges trigger effects or tiling | In-app pointer gestures only; no global edge action | **browser-impossible** for OS-global edges; in-app edges remain possible as a separate interaction |
| 21 | Compositing and desktop effects | Compositor effects, present-windows, cube, wobbly windows | CSS/WebGL effects inside the page, not window compositing | **browser-impossible** — the browser owns the compositor |
| 22 | Scripting / plugin API | KWin scripts in JavaScript or QML can inspect and mutate clients | No plugin API; all window behaviour is compiled into the app | **defer** — reopen only with a sandboxed extension boundary and a security review; arbitrary user scripts are not acceptable for Class A data |
| 23 | Skip taskbar / pager / switcher | Per-window visibility flags, usually via rules | No equivalent; the dock is the only window list | **defer** — reopen when registry placements become user-configurable; model it as a placement filter, not three separate flags |
| 24 | Window types | Normal, dialog, utility, dock, toolbar, splash, desktop, OSD, with inherited behaviour | `WindowType` plus per-type flags and component selection | **adopt — already**; extra OS window types are not meaningful in a page |

## What this says for Cachy

- The largest real gap is **keyboard window traversal**, not tiling. A window
  switcher is a better next investment than quarter tiling.
- Cachy already matches KWin on the everyday floating-window loop: focus,
  raise, maximize, minimize, resize, opacity, placement and session restore.
- The remaining KWin surface splits cleanly: OS/compositor features are
  browser-impossible; rules, grouping, shading and scripting are defer items
  with named reopen conditions. They should not be smuggled into a snapping
  item.

## Sources

- KDE Window Behavior (focus policies, raising, titlebar/window actions, snap
  zones, placement): <https://docs.kde.org/stable_kf6/en/kwin/kcontrol/windowbehaviour/index.html>
- KDE Window Rules (attributes): <https://docs.kde.org/stable_kf6/en/kwin/kcontrol/windowspecific/attributes.html>
- KDE Screen Edges (maximize/tile/quarter trigger): <https://docs.kde.org/stable_kf6/en/kwin/kcontrol/kwinscreenedges/index.html>
- KDE common keyboard shortcuts: <https://docs.kde.org/trunk_kf6/en/khelpcenter/fundamentals/kbd.html>
- KWin scripting tutorial: <https://develop.kde.org/docs/plasma/kwin/>
