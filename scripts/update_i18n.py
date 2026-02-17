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
import os

files = {
    'en': 'src/locales/locales/en.json',
    'de': 'src/locales/locales/de.json'
}

translations = {
    'common': {
        'close': {'en': "Close", 'de': "Schließen"},
        'analyzing': {'en': "Analyzing...", 'de': "Analysiere..."}
    },
    'dashboard': {
        'triggerPulse': {'en': "Trigger Quantum Pulse", 'de': "Quantenpuls auslösen"},
        'favorites': {'en': "Favorites", 'de': "Favoriten"}
    }
}

for lang, path in files.items():
    if not os.path.exists(path):
        print(f"File not found: {path}")
        continue

    with open(path, 'r') as f:
        data = json.load(f)

    # Apply updates
    for section, keys in translations.items():
        if section not in data:
            data[section] = {}
        for key, vals in keys.items():
            data[section][key] = vals[lang]

    # Write back
    with open(path, 'w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n') # Add newline

    print(f"Updated {lang} translations.")
