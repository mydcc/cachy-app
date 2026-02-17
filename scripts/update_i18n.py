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
