# GCX1 Compact Wire Format

The reference for `format: "gcx"`, the compact wire format used by the gortex
skill documentation in this repository. This file exists so those references
resolve; it is an **index and pointer**, not the upstream specification.

## What GCX1 is

GCX1 is the compact wire format returned by gortex tooling when a command or
query is given `format: "gcx"` instead of the default JSON output. The claims
about it that this repository relies on:

- **Compact** — roughly **27% fewer tokens** than the equivalent JSON.
- **Round-trippable** — the output can be parsed back into the same structure,
  so it is safe to store and re-send.
- **JSON is the fallback** — omitting `format` (or using `format: "json"`)
  yields plain JSON; agents may drop the GCX1 form at any time.

The generated skill files use it in their "How to Explore" sections, e.g.:

```
analyze(operation:"communities", id:"community-396")
explore(operation:"context", task:"understand services +30 dirs", format:"gcx")
```

## Implementations

- **JavaScript/TypeScript:** `@gortex/wire`
- **Go:** `github.com/gortexhq/gcx-go`

Agents using either package decode both the GCX1 form and plain JSON.

## Not documented here

This repository does not define the byte-level encoding (framing, token tables,
length rules, versioning). That specification lives upstream with the gortex
toolchain and its wire packages listed above. If a byte-level detail is needed,
read the source of `@gortex/wire` or `github.com/gortexhq/gcx-go` — do not
guess it from this file.

## Relationship to Cachy

GCX1 appears only in the generated gortex skill documentation
(`.github/skills/gortex-*/SKILL.md`, `.agents/skills/`, `.claude/skills/generated/`).
Application code in `src/`, `server/`, and the WASM technicals module never
produce or consume it.