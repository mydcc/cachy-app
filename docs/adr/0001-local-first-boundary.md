# ADR-0001: Local-First boundary and optional server features

- **Status:** Proposed
- **Date:** 2026-07-29
- **Deciders:** @mydcc

## Context

"Local-First" is Cachy's central promise, but it was stated as an absolute and
the code never matched the absolute. Three documents disagreed with each other
and with the source:

- `CLAUDE.md` line 23: *"Alle Nutzerdaten (Journal, Settings, API-Keys) liegen
  ausschließlich im `localStorage`. Keine Server-Persistenz einführen."* — an
  unconditional ban on server persistence.
- `README.md` line 64: *"All data remains local (localStorage), no cloud/server
  persistence."*
- `whitepaper.{de,en}.md`, section "No-Database Architecture": *"By removing the
  database… We do not process user data, so compliance is automatic by design."*
- `docs/CHANGELOG-legacy.md`, v0.94.3: *"Local-First Only: Removed 'Global Chat'
  and 'Community Cloud'."*

None of that is accurate. What the code actually contains:

**A SpacetimeDB server component, wired up and reachable from the UI.**
`src/services/cloudService.ts` connects to a SpacetimeDB instance and is used by
`src/components/settings/tabs/CloudTab.svelte`. The server module lives in
`server/spacetimedb/src/index.ts` and exposes exactly one reducer,
`send_message`. Generated client bindings sit in `src/lib/spacetimedb/` (10
files). The single table, `GlobalMessage`, has three fields: `sender`, `text`,
`sentAt`.

**A second, older chat backend that is orphaned.**
`src/lib/server/chatStore.ts` persists messages to `db/chat_messages.json` (up
to 1000, overridable via `CHAT_DB_PATH`). It is imported by nothing except its
own test file — no route and no component uses it.

The important finding is what the server component does **not** touch. No
journal entry, setting, preset, note or API key is present in the SpacetimeDB
schema or in any reducer. `cloudService.connect()` refuses to run without an
explicit token (*"Anonymous access is strictly prohibited"*), and the only entry
point is a settings tab the user has to open deliberately.

So the promise that matters — that trading data and credentials never leave the
device — holds in the code. It was the documentation that was wrong, in both
directions at once: too absolute about the architecture, and wrong about Global
Chat having been removed.

Stating the guarantee more broadly than the code delivers is the real risk here.
The whitepaper's GDPR claim ("we do not process user data") is a legal assertion,
and chat messages are user data processed on a server.

## Decision

Local-First is defined by a **data class boundary**, not by the absence of a
server.

**Class A — never leaves the device.** Journal entries, settings, API keys and
secrets, presets, private notes, and trade drafts. These live in `localStorage`
only. No feature may transmit them to any Cachy-operated server, and none may be
sent to a third party except as the credential of a user-initiated exchange
request (see the proxy description in the whitepaper, which stays accurate).

**Class B — may reside on a Cachy-operated server, under all four conditions.**
Currently only Global Chat message content.

1. **Opt-in.** Off by default. The user takes a deliberate action to enable it.
2. **Authenticated.** No anonymous access; an explicit token is required.
3. **Minimal.** Only the fields the feature needs. No Class A data may be
   attached, including as metadata.
4. **Non-essential.** Every core function — calculator, journal, risk
   management, market data — works fully with the server unreachable.

Global Chat is **kept** as an optional Class B feature on SpacetimeDB, and is
tracked on the roadmap (see `docs/ROADMAP.md`).

Any new Class B feature requires its own ADR. Moving any field from Class A to
Class B is a breaking change and requires an ADR plus a changelog entry marked
`BREAKING CHANGE:`.

## Consequences

### What this enables

- The documentation can state a guarantee that is precisely true, instead of one
  that is either broken or accidentally correct.
- SpacetimeDB is already in place, so Global Chat and future collaborative
  features have a home without renegotiating the architecture each time.
- Reviewers get a checkable rule: does this pull request move Class A data, and
  does any new server call satisfy all four Class B conditions?

### What this costs

- "No server at all" was a simpler story to tell, and simpler to audit. The
  four-condition test has to be actually applied in review, which is slower than
  a flat ban and depends on discipline rather than on structure.
- Two code paths now need to stay honest instead of one. The orphaned
  file-based `chatStore.ts` is exactly the kind of drift this boundary is meant
  to prevent, and it already exists.
- The GDPR/CCPA position becomes a real question rather than a non-issue. Chat
  messages are personal data being processed, which implies a retention policy
  and a deletion path. Neither exists yet.

### What is now forbidden

- Sending Class A data to any Cachy-operated server, in any form, including
  telemetry, crash reports and debug logs.
- Adding a Class B feature without an ADR.
- Making any core function depend on server reachability.
- Restating Local-First as an absolute in `CLAUDE.md`, the README or the
  whitepaper. It must be described as this boundary.

## Alternatives considered

**Remove Global Chat and the server component entirely.** This would make the
original absolute claim true and eliminate the GDPR question. Rejected: the
SpacetimeDB integration is substantially built (server module, 10 generated
binding files, a wired settings tab), the maintainer wants the feature, and
discarding working infrastructure to simplify a sentence in a document is the
wrong trade.

**Keep the absolute claim and treat Global Chat as an exception.** Rejected: an
unwritten exception to a stated rule is how the current contradiction arose. A
rule with a silent carve-out cannot be enforced in review.

**Route Global Chat through the existing file-based `chatStore.ts` instead of
SpacetimeDB.** Rejected: it has no authentication, persists to the application's
own filesystem, and would violate condition 2. Its fate is a separate cleanup
item on the roadmap — deliberately not resolved here, since deleting code whose
purpose is unclear is against the project's defensive-deletion rule.
