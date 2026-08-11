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

# Lists Jules "sources" (connected repos) so you can find the exact
# `sources/...` id to put in JULES_SOURCE. Run once when setting up.

set -euo pipefail

if [[ -z "${JULES_API_KEY:-}" ]]; then
  echo "❌ JULES_API_KEY ist nicht gesetzt. Key erzeugen unter https://jules.google.com/settings" >&2
  exit 1
fi

curl -sS "https://jules.googleapis.com/v1alpha/sources" \
  -H "X-Goog-Api-Key: $JULES_API_KEY"
echo ""
