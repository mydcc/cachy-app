---
id: FEAT-0031
title: Rebrand a build without editing source
type: feature
status: idea
priority: P2
milestone: M5
editions: [community]
area: build
data_class: none
adr: none
depends_on: [FEAT-0014]
---

# FEAT-0031 — Rebrand a build without editing source

## Problem

Selling a whitelabel copy means the buyer changes name, logo, palette and
domain. Today that is edits to `src/themes.css`, assets and strings — a fork
that cannot take upstream fixes.

## Proposal

Branding as configuration: name, logo, favicon, palette, typography, legal links
and external URLs, applied at build time. The existing 20+ theme system already
proves the palette is fully variable-driven, so this is mostly about extracting
identity from source into a config file.

Legal check required before anything is sold: Cachy is AGPL-3.0-or-later, which
has real consequences for a whitelabel product. That question needs a definite
answer and probably belongs in `TODO.md` as a decision rather than here.

## Acceptance criteria

- [ ] A build with a branding config produces a fully rebranded app
- [ ] No hardcoded product name, logo path or brand colour remains in `src/`
- [ ] The default config reproduces Cachy's own branding exactly
- [ ] Upstream changes apply to a rebranded build without conflicts
- [ ] The licensing position is written down and linked here

## Links

- [`FEAT-0014`](FEAT-0014-edition-build-targets.md)
- `docs/BRAND.md`, `src/themes.css`, `LICENSE`
