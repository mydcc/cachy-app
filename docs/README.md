# Documentation

The map. Every other document in `docs/` is listed here with what it is for and
who it is for — if you are an agent starting a task, start here.

---

## Start here

| I want to… | Read |
| --- | --- |
| Understand what Cachy is and why | [`VISION.md`](VISION.md) |
| Know where the code lives | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| See the long-term plan | [`MILESTONES.md`](MILESTONES.md) |
| Know what to build next | [`ROADMAP.md`](ROADMAP.md) |
| Pick up a specific piece of work | [`backlog/INDEX.md`](backlog/INDEX.md) |
| Know what I am not allowed to change | [`adr/`](adr/README.md) |
| Find something waiting on a human | [`TODO.md`](TODO.md) |

---

## The four planning documents, and how they differ

They are easy to confuse. The difference is what each one answers.

| Document | Answers | Changes |
| --- | --- | --- |
| [`VISION.md`](VISION.md) | *Why* | Rarely. When it does, everything below is re-checked |
| [`MILESTONES.md`](MILESTONES.md) | *What, in what order, and when is it done* | When a milestone completes or the plan shifts |
| [`ROADMAP.md`](ROADMAP.md) | *Which release* | Every planning pass |
| [`backlog/`](backlog/README.md) | *Exactly what to build* | Constantly |

Plus [`TODO.md`](TODO.md), which is none of these: it holds **decisions waiting
on a person**. An item there is not work anyone can pick up — it is a choice
that has to be made before work exists. When the decision is made, it becomes a
backlog item that links back.

**The rule that keeps all of this true: link, never duplicate.** One fact lives
in one file. Two copies of a rationale is how documentation stops being true,
and this repository has already paid for that once — see
[`REPO-AUDIT.md`](REPO-AUDIT.md).

---

## Reference

| Document | What |
| --- | --- |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Directory-by-directory map, the data classes, the rules that have enforcement |
| [`adr/`](adr/README.md) | Architecture Decision Records — the boundaries |
| [`BRAND.md`](BRAND.md) | Palette, typography, logo. Verified against `src/themes.css` |
| [`GLOBAL-CHAT.md`](GLOBAL-CHAT.md) | What the chat stores, how tokens are issued, retention and erasure |
| [`calculation-engine.md`](calculation-engine.md), [`calculation-engine-dev.md`](calculation-engine-dev.md) | The risk/position maths |
| [`bitunix-api/`](bitunix-api/README.md) | Bitunix API notes and quick reference |
| [`feedback-system.md`](feedback-system.md) | The in-app feedback path |
| [`REPO-AUDIT.md`](REPO-AUDIT.md) | July 2026 audit — what was found wrong and what was done. Historical, still worth reading |
| [`CHANGELOG-legacy.md`](CHANGELOG-legacy.md) | The hand-written 0.9x history. Releases from 1.0.0 are in the generated root `CHANGELOG.md` |
| [`performance/technical_report.md`](performance/technical_report.md) | Performance analysis |
| [`archive/`](archive/README.md) | Documents that were true once. Not maintained |

---

## For agents

Read in this order for any non-trivial task:

1. [`../CLAUDE.md`](../CLAUDE.md) — the non-negotiable rules. Svelte 5 runes
   only, `decimal.js` for money, CSS variables for colour, verify before
   reporting done.
2. The relevant [ADR](adr/README.md). If your change moves user data, adds a
   server dependency, or touches the calculation core, an ADR governs it.
3. Your [backlog item](backlog/README.md) and everything under its `Links`.
4. [`ARCHITECTURE.md`](ARCHITECTURE.md) if you do not already know where the
   code lives.

Then follow the working procedure in
[`backlog/README.md`](backlog/README.md#working-an-item-as-an-agent).

Four things this repository will reject work for, all of them learned the hard
way and documented in [`REPO-AUDIT.md`](REPO-AUDIT.md) and the
[archived engineering log](archive/engineering-log-2026-h1.md):

- **Claiming a fix without proof.** *A fix that compiles is not a bug that
  existed.* If you fixed a bug, a test failed before your change and passes
  after. If you cannot demonstrate the bug, say the fix is unverified — that is
  an acceptable answer and a false claim is not.
- **Deleting code whose purpose is unclear.** Record it in the backlog instead.
  Several "obviously dead" files turned out to be reachable.
- **Duplicating a rationale into a second document.** Link to it.
- **Widening the data boundary for convenience.** Class A data does not leave
  the device, including as metadata, including as a derived statistic. This has
  been violated once already and had to be removed end to end.

---

## Adding to the documentation

- A new **decision** that constrains future work → an [ADR](adr/README.md).
  Copy `adr/template.md`, open it as `Proposed`.
- A new **thing to build** → a [backlog item](backlog/README.md), then
  `npm run backlog:index`.
- A new **choice for a human** → [`TODO.md`](TODO.md), with the "why it is here"
  line intact.
- Anything else: ask whether it belongs in a document that already exists. It
  usually does.
