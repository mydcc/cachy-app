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
# Husky Pre-Commit Hook für Translation Checks
# Wird automatisch von Husky ausgeführt
#

# Prüfen ob Übersetzungsdateien geändert wurden
STAGED_FILES=$(git diff --cached --name-only)

if echo "$STAGED_FILES" | grep -qE 'src/locales/.*\.json'; then
    echo "🔍 Translation files in staging area, running checks..."
    
    if npm run check:translations; then
        echo "✅ Translation check passed"
    else
        echo ""
        echo "❌ Translation check failed!"
        echo "Run 'npm run audit:translations' for details"
        exit 1
    fi
fi
