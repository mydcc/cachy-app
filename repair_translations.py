#!/usr/bin/env python3
"""
Generate repairs for missing translations
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

# Missing in German (from English)
missing_in_de = {
    'apiErrors.failedToLoadOrders': 'Failed to load orders.',
    'apiErrors.failedToLoadPositions': 'Failed to load positions.',
}

# Missing in English (from German)
missing_in_en = {
    'app.marketDashboard.buttonTitle': 'Marktübersicht öffnen',
    'app.marketDashboard.point': 'Marktübersicht',
    'app.marketDashboard.title': 'Globale Marktanalyse',
    'settings.connections.addFeed': 'Feed hinzufügen',
    'settings.connections.apiKey': 'API Key',
    'settings.connections.apiSecret': 'API Secret',
    'settings.connections.customFeeds': 'Eigene Feeds',
    'settings.connections.dataServices': 'Datendienste',
    'settings.connections.exchanges': 'Börsen',
    'settings.connections.passphrase': 'Passphrase',
    'settings.connections.rss': 'RSS Feeds',
    'settings.imgbbExpiration': 'Ablaufzeit',
    'settings.integrations.addFeed': 'Feed hinzufügen',
    'settings.integrations.analytics': 'News & Marktdaten',
    'settings.integrations.apiKey': 'API Key',
    'settings.integrations.apiSecret': 'API Secret',
    'settings.integrations.autoExpiration': 'Auto-Löschung (Sek)',
    'settings.integrations.cmcApi': 'CoinMarketCap API',
    'settings.integrations.customRssFeeds': 'Benutzerdefinierte RSS-Feeds',
    'settings.integrations.customRssFeedsDesc': 'Füge bis zu 5 eigene RSS-Feeds hinzu (Erweitert)',
    'settings.integrations.enterKey': 'API Key eingeben',
    'settings.integrations.enterSecret': 'Secret eingeben',
    'settings.integrations.exchanges': 'Börsen Anbindung',
    'settings.integrations.filter': 'Filter',
    'settings.integrations.imgbbPrimary': 'ImgBB (Primär)',
    'settings.integrations.imgurClientId': 'Imgur Client ID',
    'settings.integrations.imgurOther': 'Imgur / Andere',
    'settings.integrations.intelligence': 'KI Anbieter Keys',
    'settings.integrations.newsApi': 'NewsAPI.org Key',
    'settings.integrations.plan': 'Plan',
    'settings.integrations.removeFeed': 'Entfernen',
    'settings.integrations.rssFilterBySymbol': 'Nach aktivem Symbol filtern',
    'settings.integrations.rssFilterBySymbolDesc': 'Zeigt nur RSS-News an, die zum Chart-Symbol passen (z.B. BTC)',
    'settings.integrations.rssPresets': 'RSS-Nachrichtenquellen',
    'settings.integrations.rssPresetsDesc': 'Wähle kuratierte Nachrichtenquellen für den KI-Kontext',
    'settings.integrations.utilities': 'Medien Speicher',
    'settings.system.backup': 'Backup erstellen',
    'settings.system.backupDesc': 'Sichere deine Einstellungen & Daten als Datei.',
    'settings.system.cacheCleared': 'Cache wurde geleert.',
    'settings.system.clearCache': 'Cache leeren',
    'settings.system.dangerZone': 'Gefahrenzone',
    'settings.system.dashboard': 'Dashboard',
    'settings.system.dangerZoneDesc': 'Vorsicht: Verwende diese Funktionen nur wenn du weißt was du tust',
    'settings.system.deleteAllData': 'Alle Daten löschen',
    'settings.system.deleteAllDataDesc': 'Löscht alle Journaleinträge und setzt die App zurück',
    'settings.system.deleteAllDataConfirm': 'Wirklich alle Daten löschen? Dies kann nicht rückgängig gemacht werden!',
}

print("=" * 80)
print("TRANSLATION REPAIR PLAN")
print("=" * 80)
print()

print("STEP 1: Add missing German translations from English")
print("-" * 80)
print(f"Adding {len(missing_in_de)} translations to de.json:")
for key, en_val in missing_in_de.items():
    print(f"  {key}: (from EN: {en_val[:40]}...)")

de_data = load_json(DE_FILE)
for key, en_val in missing_in_de.items():
    set_nested(de_data, key, en_val)

save_json(DE_FILE, de_data)
print("✓ de.json updated")
print()

print("STEP 2: Add missing English translations from German")
print("-" * 80)
print(f"Adding {len(missing_in_en)} translations to en.json:")
for key, de_val in missing_in_en.items():
    print(f"  {key}: (from DE: {de_val[:40]}...)")

en_data = load_json(EN_FILE)

# Simple German-to-English translations
de_to_en = {
    'Marktübersicht öffnen': 'Open Market Overview',
    'Marktübersicht': 'Market Overview',
    'Globale Marktanalyse': 'Global Market Analysis',
    'Feed hinzufügen': 'Add Feed',
    'API Key': 'API Key',
    'API Secret': 'API Secret',
    'Eigene Feeds': 'Custom Feeds',
    'Datendienste': 'Data Services',
    'Börsen': 'Exchanges',
    'Passphrase': 'Passphrase',
    'RSS Feeds': 'RSS Feeds',
    'Ablaufzeit': 'Expiration Time',
    'News & Marktdaten': 'News & Market Data',
    'Auto-Löschung (Sek)': 'Auto-Delete (Sec)',
    'CoinMarketCap API': 'CoinMarketCap API',
    'Benutzerdefinierte RSS-Feeds': 'Custom RSS Feeds',
    'Füge bis zu 5 eigene RSS-Feeds hinzu (Erweitert)': 'Add up to 5 custom RSS feeds (Advanced)',
    'API Key eingeben': 'Enter API Key',
    'Secret eingeben': 'Enter Secret',
    'Börsen Anbindung': 'Exchange Connection',
    'Filter': 'Filter',
    'ImgBB (Primär)': 'ImgBB (Primary)',
    'Imgur Client ID': 'Imgur Client ID',
    'Imgur / Andere': 'Imgur / Other',
    'KI Anbieter Keys': 'AI Provider Keys',
    'NewsAPI.org Key': 'NewsAPI.org Key',
    'Plan': 'Plan',
    'Entfernen': 'Remove',
    'Nach aktivem Symbol filtern': 'Filter by active symbol',
    'Zeigt nur RSS-News an, die zum Chart-Symbol passen (z.B. BTC)': 'Show only RSS news matching the chart symbol (e.g., BTC)',
    'RSS-Nachrichtenquellen': 'RSS News Sources',
    'Wähle kuratierte Nachrichtenquellen für den KI-Kontext': 'Select curated news sources for AI context',
    'Medien Speicher': 'Media Storage',
    'Backup erstellen': 'Create Backup',
    'Sichere deine Einstellungen & Daten als Datei.': 'Backup your settings & data as a file.',
    'Cache wurde geleert.': 'Cache cleared.',
    'Cache leeren': 'Clear Cache',
    'Gefahrenzone': 'Danger Zone',
    'Dashboard': 'Dashboard',
    'Vorsicht: Verwende diese Funktionen nur wenn du weißt was du tust': 'Warning: Use these functions only if you know what you\'re doing',
    'Alle Daten löschen': 'Delete All Data',
    'Löscht alle Journaleinträge und setzt die App zurück': 'Deletes all journal entries and resets the app',
    'Wirklich alle Daten löschen? Dies kann nicht rückgängig gemacht werden!': 'Really delete all data? This cannot be undone!',
}

for key, de_val in missing_in_en.items():
    en_val = de_to_en.get(de_val, de_val)
    set_nested(en_data, key, en_val)

save_json(EN_FILE, en_data)
print("✓ en.json updated")
print()

print("=" * 80)
print("✓ Translation files repaired!")
print("=" * 80)
