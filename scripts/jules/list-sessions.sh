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

# Lists recent Jules sessions (used by dispatch-backlog.mjs to avoid
# re-dispatching a backlog item that already has a session running).

set -euo pipefail

if [[ -z "${JULES_API_KEY:-}" ]]; then
  echo "❌ JULES_API_KEY ist nicht gesetzt." >&2
  exit 1
fi

curl -sS -H "x-goog-api-key: $JULES_API_KEY" \
  "https://jules.googleapis.com/v1alpha/sessions?pageSize=${1:-100}"
echo ""
