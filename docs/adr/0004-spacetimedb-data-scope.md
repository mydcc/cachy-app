# ADR-0004: What SpacetimeDB is allowed to hold, and who operates it

- **Status:** Proposed
- **Date:** 2026-08-01
- **Deciders:** @mydcc

## Context

ADR-0001 drew the line between data that never leaves the device (Class A) and
data that may sit on a Cachy-operated server (Class B), and required a new ADR
for each new Class B feature. Since then, three features have been proposed that
would all put something new into SpacetimeDB, and one architectural fact has
become load-bearing that ADR-0001 only mentions in passing.

**The fact:** ADR-0001 says *"Cachy-operated server"*, four times, deliberately.
It never says "any server". That distinction has never been tested, because
there has only ever been one instance and Cachy operates it. ADR-0003 makes it
matter: the Private edition is explicitly self-hosted, so the operator of the
database is the user themselves. Read literally, ADR-0001 does not forbid a user
storing their own journal on their own machine — but nothing says so, and an
unwritten exception to a stated rule is exactly the failure mode ADR-0001's own
"Alternatives considered" section rejected.

**What is in the database today** (`server/spacetimedb/src/index.ts`):

| Table | Fields | Class |
| --- | --- | --- |
| `global_message` | `sender` (shortened connection identity), `text`, `sent_at` | B |
| `message_cleanup_schedule` | scheduling row for the 90-day retention sweep | — (no user data) |

That is the whole schema. Three fields of user data.

**The three proposals**, and why none of them is obviously fine:

1. **Global Chat filtered by trading success.** Hide or downrank messages from
   consistently unprofitable traders. This has already been built once and
   removed: engineering-log item 12a took out a journal-derived profit factor
   from the chat payload because it was Class A data used as metadata
   (ADR-0001 condition 3) *and* because the client computed it and the server
   accepted it verbatim (`typeof profitFactor === "number"`), making it a trust
   signal anybody could forge. Re-proposing the same mechanism does not make it
   admissible.
2. **Real-time copy trading.** One user fills in the trade form; another sees it
   appear on their device live. `CLAUDE.md` lists *Trade-Entwürfe* (trade
   drafts) as Class A by name, so the obvious implementation is a Class A → B
   move, which ADR-0001 classifies as a `BREAKING CHANGE:`.
   There is also a leak that is not obvious from the feature description. A
   filled-in trade form contains the position size. Position size is derived
   from account balance and risk percentage, so publishing size together with
   entry and stop **publishes the sharer's account balance** to anyone who can
   read the row: risk amount ≈ size × stop distance, and balance ≈ risk amount
   ÷ risk percentage. Account balance is Class A and nobody proposed sharing it.
3. **Trade verification before submission.** Ambiguous between two features. As
   "check the order against the account state and the risk rules before it is
   sent", it is a safety feature that must work with the network down. As "a
   second party approves the order before it goes out", it is inherently
   server-backed.

And a fourth thing that has no home in the A/B scheme at all: the AI direction
needs market data, news articles and derived analysis to be cached and processed
somewhere. None of that originates from the user. Forcing it into Class A or
Class B gives the wrong answer in both directions.

## Decision

### 1. The operator is part of the data class

ADR-0001's classes are restated with the operator named explicitly. This is a
clarification of what ADR-0001 already says, not a relaxation of it.

- **Cachy-operated instance** — an instance run by the project for users who did
  not stand it up themselves. The Class A ban is absolute here. Nothing changes.
- **User-operated instance** — an instance the user deployed, controls, and
  configured Cachy to talk to. Class A data may reside here, but only under all
  of the following:
  - the user configured the host themselves (no default, no discovery, no
    "recommended instance" pre-filled),
  - the app states plainly, at the point of configuration, that data will leave
    the device and where it goes,
  - it stays optional: the same install works with the field empty.

  A user-operated instance is not a loophole for the Cachy-operated one. If
  Cachy ever offers a hosted Private edition, the data in it is Class B and
  Class A stays out — hosting it for someone does not make their journal
  admissible.

### 2. Class C — public data that is not the user's

A third class, because two were not enough:

**Class C — public market data and derived analysis.** Prices, klines, order
books, funding rates, news articles, and analysis computed from them. May reside
on any instance, Cachy-operated included, with no opt-in, because it is not
personal data — it did not come from the user and identifies nobody.

**The condition that makes Class C real rather than a loophole:** a Class C row
may not carry, or be joinable to, a user identity. *Which* symbols a user
watches, *when* they looked, and *what* they asked the AI are user data, and
storing a public price next to a user identity produces exactly that. So: no
`sender`, no connection identity, no per-user request log on a Class C table. A
symbol is cached once for everyone or not at all.

### 3. The three proposals, decided

**Chat success-filtering: rejected in the proposed form. Admissible in one
alternative.**

Any ranking derived from the journal is Class A metadata and stays forbidden —
that is settled by ADR-0001 condition 3 and by item 12a, and this ADR does not
reopen it. Self-reported figures are additionally worthless because they are
unverifiable, which was the second reason for the removal.

What *is* admissible is reputation computed from Class B data that already
exists — the chat itself. Peer signals on messages (a rating, a flag, an
account age, a message count) originate in the chat, are visible to everyone,
and reference nothing on the user's device. That is a different feature from the
one proposed, and it is weaker: it measures whether people liked what you wrote,
not whether you can trade. Recorded as a deliberate trade, not as an oversight.

A verified track record would need an attestation from the exchange rather than
from the client — a read-only API key proving realised PnL. That is not
admissible today: it requires handing a credential to a Cachy-operated server,
which ADR-0001 forbids outright. Not planned; written down so the next person
does not have to re-derive why.

**Copy trading: admissible as price levels only. Never as quantities.**

A shared setup contains: symbol, side, entry price, stop-loss price, take-profit
prices, and optionally a free-text note. That is the whole payload.

It never contains position size, quantity, margin, leverage, risk amount, risk
percentage, account balance, or anything from which they can be recomputed. The
receiving client sizes the trade with its own risk settings, locally — which is
also simply the correct behaviour for copy trading, since a size that is right
for the sharer's account is wrong for everyone else's.

With that payload the Class A → B move is narrow enough to make: price levels a
user chose to broadcast in a session they deliberately started are not the trade
draft `CLAUDE.md` protects, and the fields that make a draft sensitive are the
ones excluded. It remains a `BREAKING CHANGE:` under ADR-0001 and needs the
changelog entry, and the session must be explicit, per-session, and default-off
— not a setting somebody enables once and forgets.

**Trade verification: split. The safety half is core and never touches a
server.**

Pre-flight verification — does this order match what the UI shows, is the size
within the configured limits, is the stop where the user thinks it is, does the
account have the margin — is a core safety feature, runs locally, and must work
with every server unreachable. It is Milestone M1 and is explicitly **not** a
SpacetimeDB feature.

Four-eyes approval, where another person or a remote agent signs off before an
order is transmitted, is a genuine module: opt-in, authenticated, and it carries
the same payload restriction as copy trading plus the order type. It is not
planned for M1 and needs its own scope when it is.

### 4. AI features: Class C on any instance, Class A only on the user's own

Market analysis, news crawling and sentiment are Class C — cacheable anywhere,
subject to the no-user-identity condition above.

An autonomous agent's own state is not: the strategies it is allowed to run, the
capital it may commit, the positions it holds, and its decision log are Class A
in everything but name, and they are the most sensitive data the product will
ever hold — a leak is not embarrassment, it is a readable playbook of somebody's
live positions. This state may live only on a user-operated instance under
section 1, and the exchange credentials it acts with stay on the device
regardless.

## Consequences

### What this enables

- A concrete answer to "what goes in the database", per feature, instead of
  re-litigating ADR-0001 each time.
- The Private edition can self-host the full product without the architecture
  contradicting itself.
- The AI direction gets a place to cache market data that does not require
  weakening the user-data boundary.
- Copy trading gets a design that is both admissible and better than the obvious
  one, for a reason that has nothing to do with privacy.

### What this costs

- **A third class to keep straight.** Two classes were already a discipline
  problem; three is worse. The mitigation is that Class C has one memorable test
  — *is there a user identity anywhere near this row?* — and if the answer is
  yes, it is not Class C.
- **The success-filtering feature the maintainer asked for is not the one that
  can be built.** Peer reputation is a consolation prize and should not be
  described to users as a skill filter.
- **Copy trading gets harder.** Broadcasting the form as-is is a few hours' work;
  broadcasting levels and re-sizing on the receiver means the receiving client
  needs the sharer's instrument context and its own risk settings applied
  correctly, and it needs to be obvious on screen that the size shown is the
  receiver's own.
- **"User-operated" has to be enforced in the UI, not just here.** A default
  host value, a discovery mechanism, or a helpfully pre-filled field would
  quietly convert every user into a Cachy-operated case. `cloudHost` currently
  has no default, which is the behaviour this depends on.

### What is now forbidden

- Any journal-derived, settings-derived or account-derived value in a chat
  payload, in any form, including as a rank, a badge, a bucket or a boolean.
- Position size, quantity, margin, leverage, risk amount, risk percentage or
  balance in a copy-trading payload — or any field from which they follow.
- A user identity, connection identity or per-user access log on a Class C
  table.
- A default, suggested or auto-discovered value for the instance host.
- Making pre-flight trade verification depend on a server.
- Class A data on a Cachy-operated instance, hosted Private edition included.

## Alternatives considered

**Leave everything to ADR-0001 and write one ADR per feature.** What ADR-0001
literally requires. Rejected because all three proposals turn on the same two
questions — who operates the instance, and is this the user's data — and
answering them three times separately is how they get answered differently.
Per-feature ADRs are still required for anything this document does not decide.

**Allow self-reported reputation with a visible "unverified" label.** Cheap, and
the label is honest. Rejected: the number still comes from the journal, so it
fails ADR-0001 condition 3 before anyone gets to the question of whether users
read labels.

**Share the full trade including size, and let the receiver adjust.** The
obvious design, and what most copy-trading products do. Rejected: it publishes
the sharer's account balance by arithmetic, which nobody consented to and most
users would not anticipate.

**Skip Class C; treat market data as Class B.** Would work — Class B's four
conditions are satisfiable for a price cache. Rejected because it makes an
opt-in dialog necessary for caching a Bitcoin price, which trains users to click
through consent prompts, and that is a real cost paid for a category error.
