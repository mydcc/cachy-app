---
id: FEAT-0039
title: Let users add prompts, presets and themes as data files
type: feature
status: idea
priority: P2
milestone: M5
editions: [community, pro, private]
area: extensions
data_class: A
adr: ADR-0005
depends_on: []
---

# FEAT-0039 — Let users add prompts, presets and themes as data files

## Problem

Users want to individualise Cachy — their own AI prompts, their own preset
setups, their own colour themes, their own alert templates. Today each of
those is either hardcoded or editable only through the UI one item at a time,
and none of it can be shared with another user.

## Proposal

**Tier 1 of [ADR-0005](../../adr/0005-extension-model.md): declarative data,
no executable code.** A user imports a file; it is validated against a schema
and stored like any other user data. A malformed file is rejected with a
reason.

Covers AI prompt sets, preset bundles, themes, alert templates, indicator
*parameter* sets and symbol lists. Explicitly not custom indicator *logic* —
that is code and belongs to [`FEAT-0040`](FEAT-0040-computation-extensions.md).

**This is the tier to build first**, and the reason is worth stating: it
carries no security burden at all, it is genuinely useful on its own, and
building it establishes the import/validate/store path and the namespacing
that the later tiers reuse. Shipping something useful with zero sandbox risk
beats waiting for the sandbox.

Imported content is **Class A** — a user's prompts and presets are their
strategy. It stays on the device. Sharing means the user exporting a file and
sending it themselves, not the app uploading anything.

## Acceptance criteria

- [ ] Each supported kind has a versioned schema and is `safeParse`d on
      import; a malformed file is rejected with a message naming the problem
- [ ] Import never overwrites existing user data without an explicit choice
- [ ] Imported items are visibly distinguishable from built-in ones and can be
      removed
- [ ] Export produces a file that re-imports to an identical state
- [ ] A schema-version mismatch is handled explicitly, not by silent partial
      import
- [ ] Nothing imported is executed as code — asserted by a test feeding a file
      containing a function-shaped string and confirming it is stored as text
- [ ] Imported data never leaves the device
- [ ] German and English strings

## Out of scope

Custom indicator or strategy code, and anything requiring isolation. Tier 2.

## Open questions

- **Theme import and CSS injection.** A theme is data, but if it is applied by
  writing CSS variables, a hostile value could still do something unexpected.
  Values need validating against expected formats, not passed through.
- **How are these distributed?** A file the user sends around is the minimum.
  A gallery is a much bigger question and needs ADR-0004 review, since a
  Cachy-hosted gallery of user-authored content is a different thing again.

## Links

- [`docs/adr/0005-extension-model.md`](../../adr/0005-extension-model.md)
- `src/stores/preset.svelte.ts`, `src/themes.css`, `src/stores/ai.svelte.ts`
