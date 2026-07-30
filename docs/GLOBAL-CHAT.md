# Global Chat

Global Chat is the only Class B feature in Cachy — the only one where user data
is allowed to reach a server at all. Everything about it follows from the four
conditions in [ADR-0001](adr/0001-local-first-boundary.md): opt-in and off by
default, authenticated, minimal, and non-essential.

This document covers the SpacetimeDB implementation: how to run it, how a user
gets a token, and what happens to messages over time.

> There used to be a second backend — the file-based `/api/chat-v2`, which wrote
> messages to JSON on the Cachy server. It is gone (roadmap item 12). The chat
> window and side panel it fed are unchanged and now run on SpacetimeDB.

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

The token is stored as the `cloudToken` setting. It is Class A data: it stays in
`localStorage`, is encrypted along with the other credentials when a master
password is set, and must never be logged or sent anywhere except the
SpacetimeDB host the user configured.

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
| **Deletion on request** | Self-service: `delete_my_messages` deletes every message belonging to the caller, identified from `ctx.sender` rather than from an argument. No operator involvement, and no way to erase someone else's messages. |
| **Export on request** | The user's own chat lines, which they can already see in the client. Not a reducer — see below. |
| **Who can act on this** | The user, for their own messages. The operator, for anything broader. |

### How it is enforced

The module implements both halves (roadmap item 15a):

**Retention** — `message_cleanup_schedule` is a scheduled table that fires
`delete_expired_messages` hourly. The reducer deletes every row older than
90 days. It is driven by the database rather than by a client, so no caller can
skip it and nobody has to remember to run it. It uses `ctx.timestamp` rather than
`Date.now()`, because reducers must be deterministic.

**Erasure** — `delete_my_messages` deletes every message belonging to the caller.
The sender ID is derived from `ctx.sender`, never taken as an argument, so one
caller cannot erase another's messages. This makes the right to erasure
self-service: a user exercises it directly, without going through the operator.

### What still needs a machine this repository does not have

Both reducers typecheck (`npx tsc --noEmit` in `server/spacetimedb`), but they
have **not been run against a live SpacetimeDB instance** — publishing needs the
SpacetimeDB CLI, which is not vendored here. Before relying on the policy:

1. `spacetime publish` the module. The retention sweep is armed in `init`, so a
   module published before this change keeps its old messages until republished.
2. `spacetime generate` to regenerate `src/lib/spacetimedb/`. The current
   bindings predate `delete_my_messages`, so the client cannot call it yet.
3. Add a "delete my messages" control to the Cloud settings tab once the binding
   exists. Until then the reducer is reachable only through the CLI.

Step 3 is the gap that matters to a user: the capability exists on the server and
is not yet offered in the interface.

**Export** is not a reducer. Reducers are transactional and return nothing, so an
export is a client-side operation over the subscribed table — the messages a user
can already see are the messages they can already copy.

**A deployment that cannot honour a deletion request should not enable Global
Chat.** The feature is off by default, which makes that the easy choice.

---

## 5. Where the chat appears

Two surfaces, one connection:

- **Settings → Cloud** is where it is turned on and configured, and carries a
  small message log for checking that the connection works.
- **The side panel and the chat window** are the chat proper. They were built
  against the old file-based backend and are unchanged — `src/stores/chat.svelte.ts`
  now adapts SpacetimeDB rows into the same shape they already read.

The store connects only when `cloudEnabled` is on **and** a token is present. It
never connects on its own.

---

## 6. When the server is unreachable

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

## 7. Configuration

All three settings are Class A and live in `localStorage`:

| Setting | Default | Meaning |
| --- | --- | --- |
| `cloudEnabled` | `false` | Master switch. Nothing connects while this is off. |
| `cloudHost` | `http://127.0.0.1:3000` | SpacetimeDB host. |
| `cloudDbName` | `cachy-server` | Module name. |
| `cloudToken` | *(empty)* | Connection token. Encrypted with the master password, like the exchange and AI keys. |

The host and module name used to be hardcoded in `cloudService.ts`, which made
the endpoint Cachy's choice rather than the user's. They are settings now
(roadmap item 14) — the defaults describe a local development instance, not a
server anyone else operates.
