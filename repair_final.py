#!/usr/bin/env python3

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

"""
Final repair for all remaining missing translations
"""

import json
from pathlib import Path

PROJECT_ROOT = Path('/home/pat/Dokumente/GitHub/cachy-app')
DE_FILE = PROJECT_ROOT / 'src/locales/locales/de.json'
EN_FILE = PROJECT_ROOT / 'src/locales/locales/en.json'

def load_json(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def set_nested(d, keys, value):
    """Set a value in nested dict using dot notation"""
    keys = keys.split('.')
    for key in keys[:-1]:
        d = d.setdefault(key, {})
    d[keys[-1]] = value

def save_json(filepath, data):
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# Translations that should exist in both files
both_files = {
    'marketDashboard.buttonTitle': {
        'de': 'Marktübersicht öffnen',
        'en': 'Open Market Overview'
    },
    'marketDashboard.title': {
        'de': 'Globale Marktanalyse',
        'en': 'Global Market Analysis'
    },
    'settings.system.dashboard': {
        'de': 'Dashboard',
        'en': 'Dashboard'
    },
    'settings.system.dataMaintenance': {
        'de': 'Daten & Backup',
        'en': 'Data & Backup'
    },
    'settings.system.debugMode': {
        'de': 'Debug Modus',
        'en': 'Debug Mode'
    },
    'settings.system.debugModeDesc': {
        'de': 'Erweiterte Logs und Entwickler-Funktionen anzeigen.',
        'en': 'Show extended logs and developer features.'
    },
    'settings.system.factoryReset': {
        'de': 'Werkseinstellungen',
        'en': 'Factory Reset'
    },
    'settings.system.factoryResetDesc': {
        'de': 'Alles löschen und frisch starten. Nicht umkehrbar.',
        'en': 'Delete everything and start fresh. Not reversible.'
    },
    'settings.system.networkLogs': {
        'de': 'Netzwerk-Logs',
        'en': 'Network Logs'
    },
    'settings.system.networkLogsDesc': {
        'de': 'Zeigt API-Verkehr in der Konsole an.',
        'en': 'Display API traffic in the console.'
    },
    'settings.system.pauseApp': {
        'de': 'Im Hintergrund pausieren',
        'en': 'Pause in Background'
    },
    'settings.system.pauseAppDesc': {
        'de': 'Stoppt rechenintensive Aufgaben, wenn der Tab nicht aktiv ist.',
        'en': 'Stop resource-intensive tasks when the tab is not active.'
    },
    'settings.system.performance': {
        'de': 'Performance',
        'en': 'Performance'
    },
    'settings.system.reloadApp': {
        'de': 'App neu laden',
        'en': 'Reload App'
    },
    'settings.system.resetNow': {
        'de': 'Jetzt zurücksetzen',
        'en': 'Reset Now'
    },
    'settings.system.restore': {
        'de': 'Backup laden',
        'en': 'Load Backup'
    },
    'settings.system.restoreDesc': {
        'de': 'Importiere eine Sicherung aus einer Datei.',
        'en': 'Import a backup from a file.'
    },
    'settings.trading.chartTitle': {
        'de': 'Chart & Daten',
        'en': 'Chart & Data'
    },
    'settings.trading.executionTitle': {
        'de': 'Exekution & Gebühren',
        'en': 'Execution & Fees'
    },
    'settings.visuals.appearanceTitle': {
        'de': 'Optik & Design',
        'en': 'Appearance & Design'
    },
    'settings.visuals.backgroundTitle': {
        'de': 'Hintergrund',
        'en': 'Background'
    },
    'settings.visuals.layoutTitle': {
        'de': 'Layout & Struktur',
        'en': 'Layout & Structure'
    },
}

print("=" * 80)
print("FINAL TRANSLATION REPAIR")
print("=" * 80)
print()

de_data = load_json(DE_FILE)
en_data = load_json(EN_FILE)

de_count = 0
en_count = 0

for key, translations in both_files.items():
    if translations['de']:
        set_nested(de_data, key, translations['de'])
        de_count += 1
    if translations['en']:
        set_nested(en_data, key, translations['en'])
        en_count += 1

save_json(DE_FILE, de_data)
save_json(EN_FILE, en_data)

print(f"✓ Added {de_count} keys to de.json")
print(f"✓ Added {en_count} keys to en.json")
print()
print("✓ All translations repaired!")
