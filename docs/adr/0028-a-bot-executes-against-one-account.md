# ADR-0028: A bot executes against one account, and only that account's bots are shown

- **Status:** Accepted (2026-11-20, owner)
- **Date:** 2026-11-20
- **Deciders:** mydcc

## Context

Cachy holds several exchange accounts with one unmistakable active one
([`FEAT-0026`](../backlog/features/FEAT-0026-multi-account.md)). The bot
system ([`FEAT-0805`](../backlog/features/FEAT-0805-bot-system-v2-from-conditional-orders-to-strategies.md))
was built without saying which account a bot trades, and
[`FEAT-0825`](../backlog/features/FEAT-0825-bind-every-bot-to-one-account-and-show-only-the-active-account.md)
asks for that binding because "it is about money".

The code answers part of the question already, and contradicts the spec's
premise in one place:

- A bot is a `RuleDocument` at `consequence_level: "simulate"`
  (`src/services/alertEngine/botStore.ts`, `BOT_CONSEQUENCE_LEVEL`). Both bot
  lanes refuse while paper trading is off: `submitBotOrder` and
  `submitBotExit` return `paper-trading-off`
  (`src/services/alertEngine/botOrders.ts`, `botExits.ts`), and the trade
  service refuses a bot-origin request outside paper mode
  (`src/services/tradeService.ts`, `signedRequest`). A bot never reaches an
  exchange account today.
- There is **one** paper book, not one per exchange account.
  `resetAccountSession` (`src/services/accountSession.svelte.ts`) lists
  `paperState` under "not cleared": "a separate book, not account-scoped at
  all". Switching exchange accounts leaves it untouched.
- The spec assumed bots on account A and account B. With one paper book that
  case cannot arise for a `simulate` bot. It arises only once a `send` level
  exists ([`FEAT-0035`](../backlog/features/FEAT-0035-autonomous-execution-agent.md)).

Three places mix accounts or stay silent today:

1. The sidebar's bot tab (`src/components/shared/BotsList.svelte`) lists every
   paper bot and the paper position it owns, with its PnL, while a live
   exchange account is active. A trader looking at account A sees simulated
   money beside it.
2. With paper trading off, every firing is refused, yet the lifecycle
   projection (`src/services/alertEngine/botState.ts`, `deriveBotState`)
   still reads `armed`. The bot has stopped, and nothing says so.
3. The entry lane's `hasOpenPosition` port
   (`src/stores/alerts.svelte.ts`, `botOrderEnvironment`) reads the live
   account's positions when paper is off. The branch is unreachable today
   (the paper refusal runs first), but it is a bot guard reading another
   account's book.

The owner decided two open questions on 2026-11-20:

- **Paper is an account of its own**, not a mode of an exchange account. All
  `simulate` bots share it. Per-account paper books were considered and
  rejected (see Alternatives).
- **The binding applies to every edition.** Multi-account support shipped to
  all editions, and a money boundary that only paid editions get would protect
  community users less.

## Decision

1. **A bot's account follows from its consequence level, never from the
   account that is active when it fires.** `simulate` binds to the paper
   account. The binding is resolved in exactly one function
   (`botAccountOf` in `src/services/alertEngine/botAccount.ts`). Nothing
   re-derives it from `activeAccountId`.
2. **The binding lives in the execution context, not in the strategy
   document.** For `simulate` it is derived and stores nothing, so the
   content hash does not move and a template or export carries no account
   ([`FEAT-0818`](../backlog/features/FEAT-0818-curated-literature-strategy-templates.md)
   needs no stripping step). A future `send` level must store an explicit
   exchange account id beside the document. It is written once, when the bot
   is armed, from the account the trader confirmed, and it is never
   re-resolved from the active account.
3. **A bot whose account is not executing says so.** The lifecycle projection
   reads `account_unavailable` instead of `armed`. Both lanes keep refusing,
   with the refusal codes they already have. Positions the bot holds stay on
   its book untouched: no silent close, no silent fire.
4. **Every read a bot's guards make comes from its own account's book.** The
   entry lane's open-position check, the cap and budget reads and the owned
   slot index read the paper book only. The live branch of `hasOpenPosition`
   is removed rather than kept for later, because an unreachable branch that
   reads another account's book is a wrong answer waiting to become reachable.
5. **Bot surfaces show only the executing account's bots.** The sidebar's bot
   tab and the workshop list show paper bots while paper trading is on. When
   a live account is active, they list nothing and show a notice instead. The
   notice gives the number of paper bots, says that they are not trading, and
   names the switch that shows them. The switch is never a filter to discover.
   The journal opens on the active account's trades: `paper` while paper
   trading is on, `live` otherwise. Its live/paper/all switch stays the
   explicit, opt-in way to see both.
6. **Reservations are per account by construction.** A slot index
   (`ownedSlots`) is built from one account's book. Two accounts' positions
   never share an index, so the same symbol and side on two accounts is two
   reservations, not a conflict.

## Consequences

### What this enables

- The sidebar never shows simulated money under a live account.
- A trader who turns paper trading off sees immediately that their bots stop,
  and why.
- FEAT-0035 gets a ready shape: an explicit account id in the execution
  context, the same availability state and the same surface filter.

### What this costs

- A trader in live mode cannot edit or pause a paper bot without switching
  to paper mode first. That is the owner's "only the active account" decision
  taken literally, and the notice says how to get there.
- The binding is invisible for `simulate`: there is no field to inspect, only
  a function. A reviewer has to know that `simulate` means the paper account.
- Paper bots on different exchange accounts are impossible. Rehearsing
  "twenty bots on A, twenty on B" in paper is not supported.
- While paper trading is off the paper book stands still:
  `paperTradingService.tickBook` and `onPrice` return early, so a bot's open
  paper position, its stop and its take-profit are not simulated further.
  That predates this ADR. Decision 3 makes it visible (the state and the
  notice say so) rather than fixing it. A grid bot
  ([`ADR-0027`](0027-a-grid-bot-owns-an-order-set-and-its-position.md),
  FEAT-0819) inherits the same state and the same frozen ladder; its
  lifecycle must name `account_unavailable` instead of promising exits that
  keep running.
- The lifecycle list in [`ADR-0026`](0026-a-bot-owns-the-position-it-opens.md)
  decision 1 predates `limit_reached`, `awaiting_confirmation` and
  `account_unavailable`. `BotState` in `src/services/alertEngine/botState.ts`
  is the list of record.

### What is now forbidden

- Resolving a bot's account from `activeAccountId`, `apiProvider` or any
  other "what is on screen" state at fire time.
- Storing an account id inside the hashed `RuleDocument`.
- A bot guard (position check, cap, budget, slot index) that reads a book
  other than the bot's own account's.
- Building one slot index or reservation set over two accounts' positions.
- A bot surface that lists a bot whose account is not the executing one
  without saying so, or that hides such bots without a visible notice.
- A `send` bot without an explicit, stored account id, or one whose missing
  account reads as anything other than `account_unavailable`.

## Alternatives considered

- **One paper book per exchange account.** Each exchange account would get
  its own simulated balance, positions, fills and journal links, and a bot
  would trade the book of the account it was created under. It satisfies the
  spec's A/B wording at once, but it is XL. The existing book would have to be
  assigned to one account in a migration, and deleting an account would leave
  an orphaned book. The industry pattern, from training knowledge rather than
  a source checked here, treats paper as a separate account (for example
  3Commas' paper account and TradingView's paper trading). Rejected by the
  owner on 2026-11-20.
- **Bind to the account active at creation and keep it in the document.**
  Rejected: it puts account data into strategy data, moves the hash on a
  rebind, and leaks into every template.
- **Show paper bots in live mode, marked as paper.** This is the current
  behaviour minus the honesty problem. Rejected because it is exactly the
  mixing FEAT-0825 forbids: one list across two accounts.
