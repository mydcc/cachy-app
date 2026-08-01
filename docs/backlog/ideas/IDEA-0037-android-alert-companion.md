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
shared is itself a real decision with three candidates, not a detail:

| Option | What it costs |
| --- | --- |
| **Rust → WASM and native**, called from Kotlin via JNI, cross-compiled with `cargo-ndk` | One source for both browser and Android — matches the existing `technicals-wasm/` precedent — but [`FEAT-0027`](../features/FEAT-0027-alert-engine.md)'s core would need to be written in Rust rather than TypeScript |
| **Embed a JS engine** (e.g. QuickJS) in the Android app and run the TS core as-is | Core stays TypeScript, no rewrite — but adds a real runtime dependency and its own memory/battery footprint inside a foreground service, which is exactly the resource-conscious part of this idea |
| **Reimplement in Kotlin from spec**, held honest by a conformance suite mirroring [`FEAT-0018`](../features/FEAT-0018-adapter-conformance-suite.md)'s pattern | Least new infrastructure, but two implementations that must be proven to agree rather than merely intended to — the "RSI crossed 30" correctness risk this idea exists to avoid doesn't disappear, it moves into test discipline |

None of this needs deciding now — [`FEAT-0027`](../features/FEAT-0027-alert-engine.md)
ships as a normal part of the web app regardless, since the portability
requirement (plain TS/WASM, no DOM) is cheap to satisfy up front and keeps all
three options open. This table exists so the decision is informed when it's
actually made, not so it gets made today.

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
