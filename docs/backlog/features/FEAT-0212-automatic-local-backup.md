---
id: FEAT-0212
title: Automatically back up local data so a cleared browser cache can't destroy it
type: feature
status: ready
priority: P0
milestone: none
editions: [community, pro, private]
area: core
data_class: A
adr: none
depends_on: []
---

# FEAT-0212 — Automatically back up local data so a cleared browser cache can't destroy it

## Problem

Cachy has no automatic backup. `backupService.ts` can produce a backup file,
but only when the user manually opens Settings → Data & Backup and clicks
"Create Backup" (`SystemTab.svelte`). Everything Class A — journal, settings,
presets, trade state, quiz state — lives exclusively in `localStorage`.
`localStorage` can be emptied without warning: a browser "clear site data"
action, exiting private mode, a corrupted profile, an OS storage-pressure
eviction on mobile, or simply a user who never clicked the backup button. A
trader who spends 10 hours building presets and journal entries and never
manually exported a backup loses all of it the moment that happens, with no
recovery path — this is the "data that can be lost" case the backlog's own
priority rubric names as P0.

## Proposal

Two additions, both entirely local — no ADR needed, nothing crosses the
Local-First boundary — reusing `backupService.ts`'s existing payload/
encryption format rather than inventing a second one:

1. **Silent OPFS auto-snapshot.** On every meaningful change to
   settings/presets/journal/tradeState, debounced to at most once per 30s,
   write the same backup payload to a file in the Origin Private File System.
   No dialog, no user action. OPFS is a storage bucket separate from
   `localStorage` in every browser that implements it, so it survives some
   (not all) of the ways `localStorage` gets cleared — a real, free safety net
   under the status quo. On next start, if an OPFS snapshot newer than what's
   in `localStorage` is found (i.e. `localStorage` came back empty or older),
   the user is offered a restore — never applied silently.
2. **Optional periodic write-through to a user-chosen local file**, via the
   File System Access API (`showSaveFilePicker` once, a persisted
   `FileSystemFileHandle` after that, periodic `write()` on a configurable
   interval — default 5 minutes, configurable 1–15 minutes; true per-second
   writes are not proposed, see Out of scope). A user can configure a
   **second, independent file target** the same way — this covers the "one
   local file plus a mirror" part of the ask, using nothing beyond what this
   API already provides. Chromium-only (Chrome/Edge/Opera); on browsers
   without the API (Firefox, Safari) this control is hidden with an
   explanatory string, and the existing manual export plus the OPFS safety
   net still apply.

## Acceptance criteria

- [ ] An OPFS snapshot is written automatically on every meaningful data
      change, debounced to at most once per 30s, no user interaction required
- [ ] On app start, if the OPFS snapshot is newer than current `localStorage`
      state, the user is offered a restore — never applied without
      confirmation
- [ ] A user can pick a local file via the File System Access API; Cachy
      writes an updated snapshot to it on a configurable interval (default
      5 min)
- [ ] A user can configure a second, independent local file target; a write
      failure on one target does not block the other
- [ ] Both the file-target and OPFS snapshots reuse `backupService.ts`'s
      existing payload shape and optional password encryption, not a second
      format
- [ ] On a browser without the File System Access API, the periodic-local-file
      control is hidden with an explanatory message; OPFS auto-snapshot and
      the existing manual "Create Backup" still work
- [ ] A test against a mocked network asserts nothing added by this item
      makes any outbound request — the data never leaves the device
- [ ] German and English strings

## Out of scope

- **Remote/SFTP backup target.** A browser has no raw TCP/SSH socket API, so
  writing to SFTP directly from Cachy is not possible; it would require a
  backend relay, which means Class A data transiting infrastructure. That
  only clears the Local-First bar the same way
  [`IDEA-0189`](../ideas/IDEA-0189-user-operated-sync.md) does — user-operated
  instance only, no default host, explicit disclosure, its own ADR. Worth
  pursuing later as its own idea, not folded into this item; a WebDAV-over-
  HTTPS target (reachable via plain `fetch()`, no socket needed) would be a
  more tractable starting point than true SFTP if that's ever built.
- **A locally installed database server (SQL/NoSQL) on the user's machine.**
  Cachy is a browser PWA with no OS-level install permission model — there is
  no way for it to install or run a database server on the host. The
  durability gain that idea was reaching for is already what OPFS (proposal
  item 1) provides, at no extra complexity. Discarded, not deferred.
- Cloud-storage integrations (Dropbox, Google Drive, etc.) — same
  cross-boundary problem as SFTP; not requested, ruled out explicitly so it
  isn't "helpfully" added later.
- Sub-minute or literally-per-second write intervals — write amplification
  and the File System Access API's permission/handle model don't suit it; 30s
  (OPFS) / 1 min (file target) is the floor.

## Links

- `src/services/backupService.ts`, `src/services/backupService.test.ts` —
  existing manual backup/restore, the format this item extends
- `src/components/settings/tabs/SystemTab.svelte` — existing "Data & Backup"
  settings UI
- [`docs/adr/0001-local-first-boundary.md`](../../adr/0001-local-first-boundary.md)
  — Class A boundary this item stays inside
- [`IDEA-0189`](../ideas/IDEA-0189-user-operated-sync.md) — why a remote
  target needs its own ADR, ruled out of scope here for the same reason
