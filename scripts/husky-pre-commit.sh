#!/bin/bash
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
