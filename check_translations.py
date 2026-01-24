
import json

def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def flatten_dict(d, parent_key='', sep='.'):
    items = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(flatten_dict(v, new_key, sep=sep).items())
        else:
            items.append((new_key, v))
    return dict(items)

en_path = '/home/pat/Dokumente/GitHub/cachy-app/cachy-app/src/locales/locales/en.json'
de_path = '/home/pat/Dokumente/GitHub/cachy-app/cachy-app/src/locales/locales/de.json'

en_data = load_json(en_path)
de_data = load_json(de_path)

en_flat = flatten_dict(en_data)
de_flat = flatten_dict(de_data)

missing_in_de = []
identical_values = []
english_values_in_de = []

for key, val in en_flat.items():
    if key not in de_flat:
        missing_in_de.append(key)
    else:
        de_val = de_flat[key]
        if de_val == val:
             # Filter out short strings or numbers/symbols that might be same in both
            if isinstance(val, str) and len(val) > 3 and not val.replace('.', '', 1).isdigit():
                 identical_values.append((key, val))

print("=== Missing Keys in German Translation ===")
for key in missing_in_de:
    print(key)

print("\n=== Identical Values (English text in German file?) ===")
for key, val in identical_values:
    print(f"{key}: {val}")
