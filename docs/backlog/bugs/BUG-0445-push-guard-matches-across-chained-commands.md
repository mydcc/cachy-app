---
id: BUG-0445
title: The push guard matches a branch name from a later command in the same line
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: repo
data_class: none
adr: none
depends_on: []
---

# BUG-0445 — The push guard matches a branch name from a later command in the same line

## Symptom

`cachy-guard`'s `git-push-protected-branch` rule blocks a command that pushes
to a feature branch, as long as the word `develop`, `main` or `master` appears
anywhere later in the same line — including in a completely different command
after `&&`.

Observed while opening the PR for the BUG-0443/FEAT-0030 status flips: a single
line that pushed `worktree-super-alert-epic-bug-0443-27d2ed`, then chained a
`gh pr create` whose `--base` was the protected branch. The push target is a
feature branch. The guard blocked it anyway, reporting "direct push to
develop/main is forbidden".

The rule also fires on a plain `cat > file` heredoc whose *contents* quote such
a line — which is how this very file first failed to be written.

## Evidence

**Demonstrated.** The block happened in a real session, and the same work went
through once the two commands were run separately: the push on its own was
allowed, and the `gh pr create` on its own was never blocked by this rule. The
PR that resulted is #3213, which supersedes #3212.

The rule, at `.claude/hooks/pre-tool-use-guard.mjs:63`:

```js
/\bgit\s+push\b[^\n]*(?:\s|:)(?:develop|main|master)(?:\s|$)/.test(cmd)
```

## Cause

`[^\n]*` spans the whole line, so it runs straight through command separators
(`&&`, `;`, `|`) and through heredoc content. Once a push verb appears anywhere
in the command string, any later occurrence of a protected branch name
satisfies the match — no matter which command, or which quoted document, that
word actually belongs to.

The rule reads the command as flat text rather than as a push target. A
`gh pr create` against the protected branch does not trip it on its own, which
is why the bug only surfaces on chained commands and on heredocs.

## Fix

Bound the match so it cannot cross a command separator — match against the push
invocation only, up to the next `&&`, `;`, `|` or newline, and do not scan
heredoc bodies. Parsing the push refspec properly would be better still, but
the bounded match closes the false-positive class without a shell parser.

Leave the rule's intent alone: pushing directly to the protected branches stays
forbidden, and the real cases must keep failing.

## Acceptance criteria

- [ ] A test asserts the guard still blocks a direct push to each protected
      branch, by name and via a `HEAD:` refspec
- [ ] A test reproduces this defect — a chained feature-branch push followed by
      a `gh pr create` against the protected branch — and fails without the fix
- [ ] A test covers the heredoc case: a file write whose body quotes such a
      line is allowed
- [ ] The chained and heredoc commands are allowed with the fix, and the
      blocking cases above still block
- [ ] No German or English strings added (hook output is developer-facing)

## Links

- Surfaced in #3213 (supersedes #3212), which documents the workaround used
  before the guard's own `CACHY_GUARD_BYPASS=1` escape was applied
