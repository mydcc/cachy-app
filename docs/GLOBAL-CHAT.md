# Global Chat

Global Chat is the only Class B feature in Cachy — the only one where user data
is allowed to reach a server at all. Everything about it follows from the four
conditions in [ADR-0001](adr/0001-local-first-boundary.md): opt-in and off by
default, authenticated, minimal, and non-essential.

This document covers the SpacetimeDB implementation: how to run it, how a user
gets a token, and what happens to messages over time.

> A second, older chat backend also exists — the file-based `/api/chat-v2` behind
> the side panel. Which of the two survives is an open product decision, tracked
> as roadmap item 12. This document does not describe it.

---

## 1. What is stored, and what is not

The entire server-side schema is three fields
(`server/spacetimedb/src/index.ts`):

```ts
table({ name: 'global_message' }, {
  sender:  t.string(),   // first 8 hex characters of the SpacetimeDB identity
  text:    t.string(),   // the message, max 1000 characters
  sent_at: t.number(),   // timestamp
})
```

That is the whole record. No journal entry, setting, preset, note or API key
appears in the schema or in any reducer — Class B condition 3 requires that they
not appear even as metadata.

**Class A data never goes here.** Journal, settings, API keys, presets and notes
stay in `localStorage` on the device. If a feature ever needs one of them on the
server, it needs its own ADR first.

---

## 2. Running the module

The module lives in `server/spacetimedb/` and is a standalone SpacetimeDB
project.

```bash
cd server/spacetimedb
npm install
```

Publishing and running it requires the SpacetimeDB CLI, which is not vendored in
this repository. The module name you publish under is what users enter as
**Module name** in Settings → Cloud; `cachy-server` is the default the app
suggests, and it is only a suggestion.

For local development the defaults line up with a SpacetimeDB instance on
`http://127.0.0.1:3000`.

---

## 3. Tokens: how a user gets one

`cloudService.connect()` refuses to run without a token:

> *A valid authentication token is required to connect to the cloud service.
> Anonymous access is strictly prohibited.*

That is Class B condition 2, and it is enforced in code rather than by
convention.

**The honest current state: this repository contains no token issuance.** There
is no endpoint, script or reducer that mints one. A token is a SpacetimeDB
identity token, and it is the **operator of the module** who issues it — through
SpacetimeDB's own identity mechanism, outside this codebase.

So the path today is:

1. The operator runs a SpacetimeDB instance and publishes the module.
2. The operator issues an identity token to a user, out of band.
3. The user pastes it into **Settings → Cloud → Connection token** and connects.

That is a deliberate bottleneck, not an oversight to route around: it keeps the
chat from being open to anyone who finds the host. But it does mean Global Chat
is unusable by an ordinary user of a public deployment unless the operator builds
an issuance path. **If Global Chat is ever meant to be generally available, that
path has to be designed and given its own ADR** — it decides who may speak, which
is precisely the kind of decision the ADR process exists for.

The token is held in component state and is not persisted. It is Class A data:
it must never be logged or sent anywhere except the SpacetimeDB host the user
configured.

---

## 4. Message retention and deletion

Required by the GDPR consequence named in ADR-0001. This is the policy the
implementation is expected to meet.

### Policy

| | |
| --- | --- |
| **What is stored** | Message text, an 8-character sender ID, a timestamp. Nothing else. |
| **Legal basis** | Consent. The feature is off until the user turns it on, and the settings tab states what leaves the device before they do. |
| **Retention** | Messages are deleted **90 days** after they are sent. A chat is a conversation, not an archive; nothing in the product reads messages older than the visible history. |
| **Deletion on request** | A user may ask the operator to delete their messages. The 8-character sender ID identifies them within the module, so deletion is a targeted operation, not a full wipe. |
| **Export on request** | The same sender ID makes an export possible. Given the data involved — the user's own chat lines — an export is their message text and timestamps. |
| **Who can act on this** | The operator of the SpacetimeDB module. Cachy the application cannot delete server-side data; it has no privileged reducer. |

### Not yet implemented

**The module enforces none of this today.** `server/spacetimedb/src/index.ts` has
one reducer, `send_message`, and no scheduled cleanup, no deletion reducer and no
export. Writing the policy down is the first half; the module needs:

- a scheduled reducer that deletes rows older than 90 days,
- a deletion reducer scoped to one sender ID, callable only by the operator,
- the same for export.

Tracked as roadmap item 15a. Until it exists, an operator running this module
must handle deletion requests manually against the database, and should say so in
their own privacy notice.

**A deployment that cannot honour a deletion request should not enable Global
Chat.** The feature is off by default, which makes that the easy choice.

---

## 5. When the server is unreachable

Nothing else breaks. This is Class B condition 4, and it is tested rather than
asserted: `src/services/cloudService.offline.test.ts` makes the connection
builder throw and then runs the risk engine against the whitepaper's published
example.

Concretely:

- `connect()` records the failure and resolves. It does not reject at the caller,
  so no unhandled rejection can escape into the app.
- `sendMessage()` on a dead connection logs a warning and returns.
- The settings tab shows the error and states that everything else is unaffected.
- Calculator, journal, risk management and market data never touch
  `cloudService`.

---

## 6. Configuration

All three settings are Class A and live in `localStorage`:

| Setting | Default | Meaning |
| --- | --- | --- |
| `cloudEnabled` | `false` | Master switch. Nothing connects while this is off. |
| `cloudHost` | `http://127.0.0.1:3000` | SpacetimeDB host. |
| `cloudDbName` | `cachy-server` | Module name. |

The host and module name used to be hardcoded in `cloudService.ts`, which made
the endpoint Cachy's choice rather than the user's. They are settings now
(roadmap item 14) — the defaults describe a local development instance, not a
server anyone else operates.
