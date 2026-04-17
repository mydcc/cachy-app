#!/usr/bin/env python3
# Copyright (C) 2026 MYDCT
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

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
