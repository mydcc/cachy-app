#!/usr/bin/env python3
import json
import sys
from pathlib import Path

# Fix path relative to script location in scripts/ dir
PROJECT_ROOT = Path(__file__).parent.parent.resolve()
DE_FILE = PROJECT_ROOT / 'src/locales/locales/de.json'
EN_FILE = PROJECT_ROOT / 'src/locales/locales/en.json'

def check_json(filepath):
    if not filepath.exists():
        print(f"❌ File not found: {filepath}")
        return False
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            json.load(f)
        print(f"✅ Valid JSON: {filepath}")
        return True
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON in {filepath}: {e}")
        return False

if __name__ == "__main__":
    if check_json(DE_FILE) and check_json(EN_FILE):
        sys.exit(0)
    else:
        sys.exit(1)
