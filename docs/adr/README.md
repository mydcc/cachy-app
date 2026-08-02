# Architecture Decision Records

An ADR records **one** architectural decision: what was decided, why, and what
it costs. It is written once, reviewed in a pull request, and then left alone.
When a decision changes, the old ADR is marked `Superseded` and a new one is
written — records are never rewritten, because the point is to preserve the
reasoning that was true at the time.

## Why this exists

Cachy handles real money. The expensive failures are not typos, they are
architectural claims that quietly stop being true — a privacy guarantee in the
whitepaper that the code no longer honours, a "Local-First" rule in `CLAUDE.md`
that a later feature broke. An ADR makes the boundary explicit enough that a
violation is visible in review instead of discovered by a user.

## When to write one

Write an ADR when a change:

- alters where user data lives or what leaves the device,
- introduces or removes a server component or external dependency,
- changes the financial calculation core or its precision guarantees,
- picks one approach where a reasonable engineer would have picked another.

Do **not** write one for ordinary features, refactors, or bug fixes.

## Process

1. Copy `template.md` to `NNNN-short-title.md`, using the next free number.
2. Open it as `Proposed` in a pull request. The discussion happens there.
3. On merge, set the status to `Accepted` and add the date.
4. If a later decision replaces it, set `Superseded by ADR-NNNN` and link both.

## Index

| ADR | Title | Status |
| --- | --- | --- |
| [0001](0001-local-first-boundary.md) | Local-First boundary and optional server features | Proposed |
| [0002](0002-api-authentication-fails-closed.md) | API authentication fails closed | Proposed |
| [0003](0003-edition-boundary.md) | The core runs without a server; editions are additive | Proposed |
| [0004](0004-spacetimedb-data-scope.md) | What SpacetimeDB is allowed to hold, and who operates it | Proposed |
| [0005](0005-extension-model.md) | Extensions are tiered by capability, and isolation comes first | Proposed |

_Statuses move to `Accepted` when the pull request introducing them merges._
