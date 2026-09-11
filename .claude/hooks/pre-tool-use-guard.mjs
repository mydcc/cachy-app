#!/usr/bin/env node
/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * PreToolUse guard for shell commands.
 *
 * Reads the Claude Code hook payload from stdin and blocks commands that would
 * destroy uncommitted work, take down shared branches, or run remote code.
 * Exit 0 = allow, exit 2 = deny (the reason is written to stderr and shown to
 * the agent). Any parse failure allows the command: a guard that wedges the
 * harness on malformed input is worse than one that misses an edge case.
 *
 * Emergency bypass: CACHY_GUARD_BYPASS=1.
 */

const BYPASS = process.env.CACHY_GUARD_BYPASS === "1";

const PROTECTED_RM_TARGETS = new Set([
  ".",
  "..",
  "/",
  "~",
  "$HOME",
  "*",
  ".git",
]);

const RULES = [
  {
    id: "rm-recursive-force-protected",
    reason:
      "recursive force delete of a protected path (. / .. / ~ / $HOME / * / .git)",
    test: (cmd) => findProtectedRmTargets(cmd).length > 0,
  },
  {
    id: "git-push-force-without-lease",
    reason:
      "force push without --force-with-lease (AGENTS.md requires --force-with-lease)",
    test: (cmd) =>
      /\bgit\s+push\b/.test(cmd) &&
      (/--force(?!-with-lease)/.test(cmd) || /(^|\s)-f(\s|$)/.test(cmd)),
  },
  {
    id: "git-push-protected-branch",
    reason:
      "direct push to develop/main is forbidden (open a feature branch instead)",
    test: (cmd) =>
      /\bgit\s+push\b[^\n]*(?:\s|:)(?:develop|main|master)(?:\s|$)/.test(cmd),
  },
  {
    id: "git-clean-force",
    reason:
      "git clean with a force flag deletes untracked files irreversibly (use -n first)",
    test: (cmd) => /\bgit\s+clean\b[^\n]*(-[a-z]*f[a-z]*|--force)\b/.test(cmd),
  },
  {
    id: "git-reset-hard",
    reason: "git reset --hard discards uncommitted work (use git stash instead)",
    test: (cmd) => /\bgit\s+reset\b[^\n]*--hard\b/.test(cmd),
  },
  {
    id: "git-add-all",
    reason:
      "git add -A / --all / . is forbidden (commit only the files you edited)",
    test: (cmd) =>
      /\bgit\s+add\b[^\n]*(^|\s)(-A|--all)(\s|$)/.test(cmd) ||
      /\bgit\s+add\b[^\n]*(^|\s)\.(\s|$)/.test(cmd),
  },
  {
    id: "remote-code-execution",
    reason: "piping a download into a shell executes untrusted remote code",
    test: (cmd) =>
      /\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(sh|bash|zsh|fish)\b/.test(cmd),
  },
  {
    id: "fork-bomb",
    reason: "shell fork bomb",
    test: (cmd) => /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/.test(cmd),
  },
  {
    id: "dd-block-device",
    reason: "dd writing to a block device can destroy the host disk",
    test: (cmd) => /\bdd\b[^\n]*\bof=\/dev\//.test(cmd),
  },
  {
    id: "chmod-777",
    reason: "world-writable permissions are unsafe",
    test: (cmd) => /\bchmod\b[^\n]*\b777\b/.test(cmd),
  },
];

function findProtectedRmTargets(cmd) {
  const hits = [];
  for (const segment of cmd.split(/[;&|]+/)) {
    const match = segment.match(/(?:^|\s)rm\s+([^\n]*)/);
    if (!match) continue;
    const args = match[1].trim().split(/\s+/).filter(Boolean);
    let recursive = false;
    let force = false;
    const targets = [];
    for (const arg of args) {
      if (arg.startsWith("-") && arg !== "-") {
        if (/r/i.test(arg)) recursive = true;
        if (/f/i.test(arg)) force = true;
      } else {
        targets.push(arg);
      }
    }
    if (!recursive || !force) continue;
    for (const target of targets) {
      const normalized = target.replace(/\/+$/, "");
      if (normalized === "" || PROTECTED_RM_TARGETS.has(normalized)) {
        hits.push(target);
      }
    }
  }
  return hits;
}

function readStdin() {
  if (process.stdin.isTTY) return Promise.resolve("");
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(""));
  });
}

async function main() {
  if (BYPASS) process.exit(0);

  const raw = await readStdin();
  if (!raw.trim()) process.exit(0);

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.stderr.write("[cachy-guard] Could not parse hook payload; allowing.\n");
    process.exit(0);
  }

  const toolName = payload?.tool_name ?? payload?.toolName;
  if (toolName !== "Bash") process.exit(0);

  const command = payload?.tool_input?.command ?? payload?.toolInput?.command;
  if (typeof command !== "string" || command.trim() === "") process.exit(0);

  const violation = RULES.find((rule) => {
    try {
      return rule.test(command);
    } catch {
      return false;
    }
  });

  if (!violation) process.exit(0);

  process.stderr.write(
    `[cachy-guard] Blocked (${violation.id}): ${violation.reason}.\n` +
      `Command: ${command}\n` +
      `If this is intentional, re-run with CACHY_GUARD_BYPASS=1.\n`,
  );
  process.exit(2);
}

main();
