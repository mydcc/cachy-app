---
id: IDEA-0037
title: A native Android companion that runs only the alert engine
type: idea
status: idea
priority: P3
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: [FEAT-0027]
---

# IDEA-0037 — A native Android companion that runs only the alert engine

## The thought

The PWA cannot deliver background alerts without breaking
[ADR-0004](../../adr/0004-spacetimedb-data-scope.md). A Service Worker is
killed after roughly 30 seconds idle, so it cannot hold an exchange WebSocket
open in the background. The only PWA-native alternative, Web Push, requires a
**server** to hold the alert definition and trigger the push — and what
symbols and levels a trader watches is their strategy, Class A under
[ADR-0001](../../adr/0001-local-first-boundary.md). Periodic Background Sync is
not a real alternative: Chromium-only, with an interval the browser decides
(practically ≥12h, no guarantee), useless for a price alert.

A native Android app with a foreground service can hold the exchange
connection and evaluate alerts **on the device**, so the alert definition never
leaves it. That is the only way to get background alerting that stays inside
the Local-First boundary — not a nicer wrapper, the one thing the PWA
structurally cannot do.

**Deliberately narrow scope.** Not a full app port. The calculator, journal and
trading UI stay PWA — a WebView shell around them would inherit exactly the
PWA's limits, so porting them natively buys nothing. Only the alert engine
needs a native shell: a foreground service holding the WebSocket, running
[`FEAT-0027`](../features/FEAT-0027-alert-engine.md)'s portable evaluation
core, firing a local notification on match. The rest of Cachy is reached by
tapping the notification into the PWA/browser.

## Why this is `idea`, not `specced`

The platform decision itself is open, not just the implementation. Real costs
that a scoping pass has to weigh, not gloss over:

- Android requires a persistent notification for a foreground service, and the
  user has to exempt the app from battery optimisation or Doze kills it —
  friction at exactly the install step.
- Play Store review is stricter for finance apps; sideloading avoids that at
  the cost of legitimacy for a trading tool.
- **iOS gets none of this.** Background WebSockets are blocked there
  regardless of approach, so iOS users would have no background-alert story at
  all unless a second, different mechanism is built for them — which reopens
  the server question this idea exists to avoid.
- A second codebase (Kotlin, presumably) means a second thing to keep working,
  even at this narrow scope.

Nothing here blocks M0–M3. It becomes worth scoping once
[`FEAT-0027`](../features/FEAT-0027-alert-engine.md) exists and the portable
core is proven out — building the companion before the core it wraps exists
would guess at an interface that doesn't exist yet.

## Impact on the build — this is not a side effect of `npm run build`

Worth stating plainly, because "just build an extra APK" understates it. The
companion is a **separate Android project** (Kotlin, Gradle, Android SDK) with
its own toolchain, its own CI, its own signing keys, its own versioning, and
its own distribution path (Play Store or direct APK). None of that runs
through Vite or semantic-release, and it does not become buildable by adding a
step to `package.json`.

The one genuinely shared piece is the alert evaluation logic, and *how* it is
shared was a real decision with three candidates:

| Option | What it costs |
| --- | --- |
| **Rust → WASM and native**, called from Kotlin via JNI, cross-compiled with `cargo-ndk` | One source for both browser and Android — matches the existing `technicals-wasm/` precedent — but the evaluation core has to be Rust rather than TypeScript |
| **Embed a JS engine** (e.g. QuickJS) and run the TS core as-is | Core stays TypeScript, no rewrite — but adds a runtime with its own memory and battery footprint inside a foreground service, which is exactly the resource-constrained part of this idea |
| **Reimplement in Kotlin from spec**, held honest by a conformance suite mirroring [`FEAT-0018`](../features/FEAT-0018-adapter-conformance-suite.md) | Least new infrastructure, but two implementations that must be *proven* to agree rather than intended to — the "did RSI cross 30" correctness risk moves into test discipline instead of going away |

**Decided: Rust → WASM, on the maintainer's instruction that evaluation must be
the fastest, most robust and safest option available.** The reasoning that
supports it, and one honest qualification:

- **The precedent already exists.** `technicals-wasm/` is Rust compiled to
  WASM and wired into the build through `scripts/build_wasm.sh`. The toolchain,
  the build step and the fallback-to-committed-binary behaviour are proven in
  this repo, so this is an extension of an existing pattern rather than a new
  one.
- **It is the only option that makes the companion nearly free.** The same
  crate cross-compiles to Android with `cargo-ndk`. The other two options solve
  the browser and then still owe an Android answer.
- **Robustness is the strongest argument, more than raw speed.** Exhaustive
  matching, no null, and no silent numeric coercion are real advantages for
  "fire exactly once per crossing" logic — the same reasons that make Rust a
  good fit for the indicator maths it would sit beside.
- **The honest qualification: raw speed is not where the win is.** Alert
  evaluation compares a handful of numbers per tick; it is not compute-bound,
  and the cost is dominated by the WebSocket and by indicator calculation
  (already WASM). Picking Rust here buys correctness guarantees, a shared
  Android path, and adjacency to `technicals-wasm/` — not a measurable
  reduction in evaluation latency. Worth stating so nobody later benchmarks it
  expecting a speedup that was never the point.

**Scope of the decision:** the *evaluation core* is Rust. Alert CRUD, storage,
settings and all UI stay TypeScript/Svelte — they are bookkeeping, they touch
the DOM, and moving them across a WASM boundary would cost clarity for nothing.

## Does this cost anything elsewhere — the 3D background, Svelte reactivity?

**No, and that is the specific reason for the narrow scope rather than a full
port.** The question is worth answering explicitly because the two obvious
alternatives both *would* have cost something:

| Approach | Effect on the existing app |
| --- | --- |
| **Alert-only companion** (this idea) | **None.** The companion renders no UI at all — it is a foreground service plus a notification. The PWA is not modified, not wrapped, not rebuilt. Three.js background, WebGPU acceleration, Svelte 5 runes, the window system: all untouched, all still running in a real browser engine |
| Capacitor/WebView wrapper around the whole app | Would put the entire UI inside Android's WebView, where **WebGPU support is limited or behind flags** — a genuine risk to the accelerated indicator path and the 3D background. Svelte reactivity itself would survive (still the same JS), but the rendering layer would become the WebView's problem rather than the browser's |
| Native rewrite of the UI | Loses Svelte entirely, and with it the reactivity model, the theme system and the window manager. Never on the table |

So the trade is the reverse of what it might look like: the companion exists
*so that* nothing has to be given up. Everything visual and reactive stays in
the PWA, where it already works; only the one capability a browser structurally
cannot provide — holding a connection while closed — moves to a native process
that has no UI to compromise.

The one genuine cost is the shared evaluation core being Rust rather than
TypeScript, which is a constraint on [`FEAT-0027`](../features/FEAT-0027-alert-engine.md)'s
implementation, not a loss anywhere else in the app.

## What would have to be true first

- [`FEAT-0027`](../features/FEAT-0027-alert-engine.md) built with a portable,
  DOM-free evaluation core, as that item now specifies.
- A decision on the iOS gap: ship Android-only and say so, or decide the
  server-backed path is worth its own ADR-0004 review for iOS users
  specifically.
- A decision on distribution: Play Store (review overhead, legitimacy) versus
  sideload/direct APK (no review, weaker trust signal for a finance app).

## Links

- [`docs/TODO.md`](../../TODO.md) item 21 — the full platform analysis this
  idea is drawn from
- [`FEAT-0027`](../features/FEAT-0027-alert-engine.md) — the engine this wraps
- [`docs/adr/0004-spacetimedb-data-scope.md`](../../adr/0004-spacetimedb-data-scope.md)
