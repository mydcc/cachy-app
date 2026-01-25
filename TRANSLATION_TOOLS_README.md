# Translation Audit Tools

Automatische Übersetzungs-Audit-Skripte für SvelteKit-Projekte mit i18n.

## 📁 Verfügbare Skripte

### 1. `verify_translations.py` - Schnelle Verifikation

Führt eine schnelle Überprüfung der Übersetzungsdateien durch.

**Verwendung:**

```bash
# Im Projekt-Verzeichnis
./verify_translations.py

# Von überall mit Pfad-Argument
python3 verify_translations.py /pfad/zum/projekt

# Oder absoluter Pfad
/pfad/zu/verify_translations.py /pfad/zum/projekt
```

**Ausgabe:**

- Anzahl der Keys in Deutsch und Englisch
- Gemeinsame Keys und Unterschiede
- Leere Werte
- Sample-Key-Verifikation
- Gesamtresultat

### 2. `audit_translations.py` - Vollständiges Audit

Umfassende Analyse aller Übersetzungskeys.

**Verwendung:**

```bash
# Im Projekt-Verzeichnis
./audit_translations.py

# Mit Pfad-Argument
python3 audit_translations.py /pfad/zum/projekt
```

**Ausgabe:**

- Dictionary-Vergleich (Keys nur in DE/EN)
- Fehlende oder leere Werte
- Code-Referenzen vs. Übersetzungen
- Möglicherweise ungenutzte Keys
- Detaillierte Statistiken

### 3. `audit_detailed.py` - Detaillierter Report

Zeigt exakte Datei-Locations für fehlende Übersetzungen.

**Verwendung:**

```bash
# Im Projekt-Verzeichnis
./audit_detailed.py

# Mit Pfad-Argument
python3 audit_detailed.py /pfad/zum/projekt
```

**Ausgabe:**

- Fehlende Keys mit Datei:Zeile Angaben
- Code-Snippets wo Keys verwendet werden
- Werte aus der jeweils anderen Sprache

---

## 🚀 Schnellstart

```bash
# 1. Skripte ausführbar machen
chmod +x audit_translations.py verify_translations.py audit_detailed.py

# 2. Schnelle Verifikation
./verify_translations.py

# 3. Vollständiges Audit (bei Bedarf)
./audit_translations.py

# 4. Detaillierter Report (für Debugging)
./audit_detailed.py
```

---

## 📋 Voraussetzungen

- **Python 3.6+**
- **Projekt-Struktur:**

  ```
  projekt-root/
  ├── src/
  │   └── locales/
  │       └── locales/
  │           ├── de.json
  │           └── en.json
  └── (audit-skripte hier oder überall)
  ```

Die Skripte suchen automatisch nach:

- `src/locales/locales/de.json`
- `src/locales/locales/en.json`

---

## 🎯 Verwendungsszenarien

### Szenario 1: Regelmäßige Checks

```bash
# Wöchentlich oder bei jedem Release
cd /pfad/zum/projekt
./verify_translations.py
```

### Szenario 2: Nach größeren Änderungen

```bash
# Nach vielen neuen Features
./audit_translations.py | tee translation_report.txt
```

### Szenario 3: Debugging fehlender Übersetzungen

```bash
# Wenn die App untranslated Keys zeigt
./audit_detailed.py | grep "KEY_NAME"
```

### Szenario 4: CI/CD Integration

```bash
# In .github/workflows/ci.yml oder ähnlich
- name: Check Translations
  run: |
    python3 scripts/verify_translations.py .
    if [ $? -ne 0 ]; then
      echo "Translation check failed!"
      exit 1
    fi
```

---

## 📊 Was wird geprüft?

### ✅ Übersetzungsdateien (de.json, en.json)

- Konsistenz zwischen den Sprachen
- Fehlende Keys
- Leere oder null-Werte
- JSON-Syntax-Validierung

### ✅ Code-Referenzen

- `$_("key.name")` Calls in .svelte
- `$t("key.name")` Calls in .ts/.js
- Alle referenzierten Keys existieren in beiden Sprachen

### ⚠️ Potenzielle Probleme

- Keys nur in einer Sprache vorhanden
- Keys im Code aber nicht in Übersetzungen
- Übersetzungen ohne Code-Referenzen (möglicherweise veraltet)

---

## 🔧 Anpassung an andere Projekte

Die Skripte können für andere Projekte angepasst werden:

1. **Andere Dateinamen:**

   ```python
   # In den Skripten ändern:
   DE_TRANSLATIONS = SRC_DIR / 'locales/de.json'  # statt locales/locales/de.json
   EN_TRANSLATIONS = SRC_DIR / 'locales/en.json'
   ```

2. **Mehr Sprachen:**

   ```python
   # Weitere Sprachen hinzufügen:
   FR_TRANSLATIONS = SRC_DIR / 'locales/locales/fr.json'
   fr_flat = load_translations(FR_TRANSLATIONS)
   ```

3. **Andere Translation-Calls:**

   ```python
   # Pattern für andere i18n-Bibliotheken:
   patterns = [
       r"\$t\(['\"]([^'\"]+)['\"]\)",     # $t('key')
       r"i18n\.t\(['\"]([^'\"]+)['\"]\)", # i18n.t('key')
       r"t\(['\"]([^'\"]+)['\"]\)",       # t('key')
   ]
   ```

---

## 🐛 Troubleshooting

### Problem: "FileNotFoundError: de.json not found"

**Lösung:**

```bash
# Pfad zum Projekt explizit angeben
python3 verify_translations.py /absoluter/pfad/zum/projekt
```

### Problem: "Permission denied"

**Lösung:**

```bash
chmod +x audit_translations.py verify_translations.py audit_detailed.py
```

### Problem: Falsche Projekt-Struktur erkannt

**Lösung:** Überprüfe ob die Struktur `src/locales/locales/` existiert oder passe die Skripte an.

---

## 📝 Output-Beispiele

### Erfolgreiches Audit

```
✓ German keys:         889
✓ English keys:        893
✓ Shared keys:         889
✓ Code references:     408 (all present ✅)
✓ Empty values:          0 (clean ✅)
🎉 RESULT: ALL CRITICAL ISSUES FIXED
```

### Probleme gefunden

```
❌ ONLY IN GERMAN (5 keys):
   - settings.newFeature.title: Neues Feature
   - settings.newFeature.desc: Beschreibung...

❌ REFERENCED IN CODE BUT MISSING IN ENGLISH (2 keys):
   - dashboard.newWidget
   USED IN: src/components/Dashboard.svelte:45
```

---

## 💡 Best Practices

1. **Vor jedem Commit:**

   ```bash
   ./verify_translations.py && git add .
   ```

2. **Nach größeren Features:**

   ```bash
   ./audit_translations.py > audit_$(date +%Y%m%d).txt
   ```

3. **In Pre-Commit Hook:**

   ```bash
   # .git/hooks/pre-commit
   #!/bin/bash
   python3 verify_translations.py .
   exit $?
   ```

4. **Regelmäßige Reports:**

   ```bash
   # Cronjob oder GitHub Actions
   ./audit_translations.py | mail -s "Translation Audit" team@example.com
   ```

---

## 📚 Weitere Ressourcen

- [svelte-i18n Documentation](https://github.com/kaisermann/svelte-i18n)
- [SvelteKit i18n Guide](https://kit.svelte.dev/docs/i18n)
- [Translation Best Practices](https://phrase.com/blog/posts/i18n-best-practices/)

---

## 🤝 Beitragen

Verbesserungen und Anpassungen sind willkommen! Die Skripte sind absichtlich einfach gehalten und können leicht erweitert werden.

---

## 📄 Lizenz

Diese Skripte gehören zum cachy-app Projekt und unterliegen der gleichen Lizenz (AGPL-3.0-only).

---

**Stand:** 25. Januar 2026  
**Version:** 1.0  
**Kompatibilität:** Python 3.6+, SvelteKit-Projekte mit svelte-i18n
