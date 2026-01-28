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
# Translation Check Script
# Führt regelmäßige Übersetzungsprüfungen durch
#

set -e

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Projekt-Root ermitteln
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

echo "======================================"
echo "  Translation Audit Check"
echo "======================================"
echo "Project: $PROJECT_ROOT"
echo "Date: $(date)"
echo ""

# Prüfen ob Python verfügbar ist
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python 3 ist nicht installiert${NC}"
    exit 1
fi

# Quick Check mit verify_translations.py
echo "🔍 Running translation verification..."
if python3 "$PROJECT_ROOT/verify_translations.py" "$PROJECT_ROOT" > /tmp/translation_check.log 2>&1; then
    echo -e "${GREEN}✅ Basic verification passed${NC}"
else
    echo -e "${RED}❌ Basic verification failed${NC}"
    cat /tmp/translation_check.log
    exit 1
fi

# Prüfen auf kritische Fehler
echo ""
echo "🔬 Checking for critical issues..."

CRITICAL_ERRORS=0

# Teste ob fehlende Code-Referenzen vorhanden sind
MISSING_DE=$(python3 "$PROJECT_ROOT/audit_translations.py" "$PROJECT_ROOT" 2>/dev/null | grep "Missing in DE (code ref):" | grep -oE '[0-9]+' || echo "0")
MISSING_EN=$(python3 "$PROJECT_ROOT/audit_translations.py" "$PROJECT_ROOT" 2>/dev/null | grep "Missing in EN (code ref):" | grep -oE '[0-9]+' || echo "0")

if [ "$MISSING_DE" -gt 0 ]; then
    echo -e "${RED}❌ $MISSING_DE missing German translations found in code${NC}"
    CRITICAL_ERRORS=$((CRITICAL_ERRORS + 1))
else
    echo -e "${GREEN}✅ All code references have German translations${NC}"
fi

if [ "$MISSING_EN" -gt 0 ]; then
    echo -e "${RED}❌ $MISSING_EN missing English translations found in code${NC}"
    CRITICAL_ERRORS=$((CRITICAL_ERRORS + 1))
else
    echo -e "${GREEN}✅ All code references have English translations${NC}"
fi

# Prüfen auf leere Werte
EMPTY_VALUES=$(python3 -c "
import json
import sys
de = json.load(open('$PROJECT_ROOT/src/locales/locales/de.json'))
en = json.load(open('$PROJECT_ROOT/src/locales/locales/en.json'))

def count_empty(obj, prefix=''):
    count = 0
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(v, dict):
                count += count_empty(v, f'{prefix}.{k}' if prefix else k)
            elif not v or str(v).strip() == '':
                count += 1
    return count

print(count_empty(de) + count_empty(en))
" 2>/dev/null || echo "0")

if [ "$EMPTY_VALUES" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  $EMPTY_VALUES empty translation values found${NC}"
else
    echo -e "${GREEN}✅ No empty translation values${NC}"
fi

# Zusammenfassung
echo ""
echo "======================================"
if [ $CRITICAL_ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ Translation check PASSED${NC}"
    echo "======================================"
    exit 0
else
    echo -e "${RED}❌ Translation check FAILED${NC}"
    echo "Critical errors: $CRITICAL_ERRORS"
    echo "======================================"
    echo ""
    echo "Run for detailed report:"
    echo "  ./audit_translations.py"
    exit 1
fi
