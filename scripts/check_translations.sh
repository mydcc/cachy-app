#!/bin/bash
# Check Translations Wrapper Script

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Running translation audit from $PROJECT_ROOT..."

# Run the python script
python3 "$SCRIPT_DIR/audit_translations.py" "$PROJECT_ROOT"
