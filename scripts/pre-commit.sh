#!/bin/bash
#
# Git Pre-Commit Hook für Translation Checks
# Installation: cp pre-commit.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
#

# Prüfen ob Übersetzungsdateien geändert wurden
TRANSLATION_FILES_CHANGED=$(git diff --cached --name-only | grep -E '(de\.json|en\.json)' || true)

if [ -z "$TRANSLATION_FILES_CHANGED" ]; then
    # Keine Übersetzungsdateien geändert, Check überspringen
    exit 0
fi

echo "🔍 Translation files changed, running checks..."

# Check ausführen
if ./check_translations.sh; then
    echo "✅ Translation check passed"
    exit 0
else
    echo ""
    echo "❌ Translation check failed!"
    echo ""
    echo "Options:"
    echo "  1. Fix the issues and try again"
    echo "  2. Run './audit_translations.py' for detailed report"
    echo "  3. Skip this check with: git commit --no-verify"
    echo ""
    exit 1
fi
