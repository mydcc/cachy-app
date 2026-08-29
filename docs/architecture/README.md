# Architecture Dataflow Diagram

The visual overview of how Cachy moves data: market sources → ingest →
processing → local-first storage → consumption/execution. The rendered diagram
is [`cachy-architecture.dataflow.html`](cachy-architecture.dataflow.html) —
self-contained, no server needed, open it in a browser.

## Files

| File | Role |
| --- | --- |
| `cachy-architecture.dataflow.json` | **Source of truth.** Edit this. |
| `cachy-architecture.dataflow.html` | Generated artifact. Never edit by hand. |

## Workflow

```bash
npm run arch        # validate + rebuild HTML
npm run arch:validate   # schema + layout checks only (showcase quality)
npm run arch:build      # regenerate the HTML
```

Commit **both files together** in the same PR. CI re-validates the JSON and
rebuilds the HTML to diff against the committed one — a stale HTML turns the
check red.

The `arch:*` scripts expect Archify installed at
`~/.config/opencode/skills/archify` (see <https://github.com/tt-a1i/archify>).
CI clones it fresh, so no repo dependency exists.

## When must the JSON change?

Only when the *architecture* changes, never for ordinary code changes:

- A service is added or removed (new exchange, new storage, new integration)
- A data flow changes (service A now talks to B, new data source)
- The Local-First boundary changes (new Class A data, new cloud touchpoint)

Bugfixes, refactors, UI, i18n, indicators — no diagram change.

Rule of thumb: if a PR changes *who talks to whom* or *what lives where*
(device / cloud / exchange), update the diagram in the same PR.

## Known simplifications

- Calculator / trade-exec **read** paths from Journal/Presets are charted via
  the store → trade-exec sync arrow plus a note in the Local-First boundary
  card, not as separate read arrows.
- Support services (backup, toast, tracking, AI models) are listed in the
  "Support Services" card, not drawn as flows.
- The Chat Cloud node has no flow on purpose: it marks the core/cloud boundary
  (Class B, opt-in — the core never imports SpacetimeDB).
