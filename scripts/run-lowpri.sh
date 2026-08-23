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
# Run a command with low CPU scheduling priority so several parallel agent
# worktrees can run heavy checks (svelte-check, vitest) at the same time
# without starving interactive work (editor, dev server, terminals).
#
# Falls back to a direct exec on systems without nice(1), so npm scripts
# stay portable across platforms.
#
# Override the priority via LOWPRI_NICENESS (default: 15).
#

set -eu

if [ "$#" -eq 0 ]; then
    echo "Usage: $0 <command> [args...]" >&2
    exit 64
fi

if command -v nice >/dev/null 2>&1; then
    exec nice -n "${LOWPRI_NICENESS:-15}" "$@"
fi

exec "$@"
