#!/bin/bash

# Copyright (C) 2026 MYDCT
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

#
# Run a command with low CPU scheduling priority, idle I/O priority, and restricted
# CPU affinity (leaving at least half the machine's cores untouched) so several parallel
# agent worktrees can run checks (svelte-check, vitest) without starving interactive work
# (desktop UI, browser, editor, dev server, terminals).
#
# Falls back gracefully on systems without taskset, ionice, or nice, so npm scripts
# stay portable across platforms and CI environments.
#
# Overrides:
#   LOWPRI_NICENESS   - nice level (default: 19)
#   LOWPRI_CORES      - exact number of cores to pin via taskset
#   LOWPRI_NO_TASKSET - set to 1 to disable taskset affinity clamping
#

set -eu

if [ "$#" -eq 0 ]; then
    echo "Usage: $0 <command> [args...]" >&2
    exit 64
fi

EXEC_CMD=("$@")

# 1. Restrict CPU affinity via taskset (leave at least half the machine's cores free for user/desktop)
if [ -z "${CI:-}" ] && [ -z "${LOWPRI_NO_TASKSET:-}" ] && command -v taskset >/dev/null 2>&1; then
    TOTAL_CORES=$(nproc 2>/dev/null || echo 1)
    if [ "$TOTAL_CORES" -gt 2 ]; then
        TARGET_CORES="${LOWPRI_CORES:-$(( TOTAL_CORES / 2 ))}"
        AFFINITY="0-$(( TARGET_CORES - 1 ))"
        EXEC_CMD=(taskset -c "$AFFINITY" "${EXEC_CMD[@]}")
    elif [ "$TOTAL_CORES" -eq 2 ]; then
        EXEC_CMD=(taskset -c 0 "${EXEC_CMD[@]}")
    fi
fi

# 2. Disk I/O scheduling class: idle (3) so heavy file reads/writes don't stutter the desktop
if command -v ionice >/dev/null 2>&1; then
    EXEC_CMD=(ionice -c 3 "${EXEC_CMD[@]}")
fi

# 3. CPU scheduling priority: lowest priority (19 by default)
if command -v nice >/dev/null 2>&1; then
    EXEC_CMD=(nice -n "${LOWPRI_NICENESS:-19}" "${EXEC_CMD[@]}")
fi

exec "${EXEC_CMD[@]}"

