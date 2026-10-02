---
name: gortex-components-settings-3-dirs-viewertext
description: "Work in the components/settings +3 dirs · viewerText area — 395 symbols across 6 files (99% cohesion)"
---

# components/settings +3 dirs · viewerText

395 symbols | 6 files | 99% cohesion

## When to Use

Use this skill when working on files in:
- `docs/architecture/cachy-architecture.dataflow.html`
- `src/components/settings/OrderAuditSettings.svelte`
- `src/components/settings/PaperTradingSettings.svelte`
- `src/components/settings/RiskLimitsSettings.svelte`
- `src/service-worker.ts`
- `tests/gpu/webGpuParity.spec.ts`

## Key Files

| File | Symbols |
|------|---------|
| `docs/architecture/cachy-architecture.dataflow.html` | detailLevel, syncViewportClip, reset, routeOverviewStatus, renderFacts, ... |
| `src/components/settings/OrderAuditSettings.svelte` | clearLog, confirmed |
| `src/components/settings/PaperTradingSettings.svelte` | resetBook, confirmed |
| `src/components/settings/RiskLimitsSettings.svelte` | RiskLimitsSettings, event, resetAll, confirmed, engage, ... |
| `src/service-worker.ts` | addFilesToCache, cache |
| `tests/gpu/webGpuParity.spec.ts` | bundleParityCases, result |

## Connected Communities

- **architecture · measure** (2 cross-edges)
- **architecture · storyStep** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-11")
explore(operation:"context", task:"understand components/settings +3 dirs · viewerText", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
