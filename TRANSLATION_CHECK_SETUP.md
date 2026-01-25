# Translation Check - Installations- & Setup-Anleitung

## 🎯 Übersicht

Es gibt **4 Möglichkeiten**, regelmäßige Translation-Checks durchzuführen:

1. **NPM Scripts** - Manuell oder in anderen Scripts
2. **Git Pre-Commit Hook** - Automatisch vor jedem Commit
3. **GitHub Actions** - Automatisch bei Push/PR/täglich
4. **Cronjob** - Regelmäßig auf Server/Entwickler-Maschine

---

## 1️⃣ NPM Scripts (Empfohlen für Entwicklung)

### ✅ Bereits installiert

Die Scripts wurden zur `package.json` hinzugefügt:

```bash
# Schneller Check (empfohlen vor Commits)
npm run check:translations

# Vollständiges Audit
npm run audit:translations

# Nur Verifikation
npm run verify:translations
```

### Verwendung im Workflow

```bash
# Vor dem Commit
npm run check:translations && git commit -m "..."

# In anderen Scripts kombinieren
npm run check && npm run check:translations && npm run build
```

---

## 2️⃣ Git Pre-Commit Hook

### Installation

**Option A: Manuell**

```bash
# Hook installieren
cp scripts/pre-commit.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit

# Testen
git add src/locales/locales/de.json
git commit -m "test"
```

**Option B: Mit Husky (wenn bereits im Projekt)**

```bash
# Husky installieren (falls noch nicht vorhanden)
npm install --save-dev husky
npx husky install

# Hook erstellen
npx husky add .git/hooks/pre-commit "bash scripts/husky-pre-commit.sh"
```

### Verhalten

- ✅ Prüft automatisch bei jedem Commit
- ✅ Nur wenn Translation-Dateien geändert wurden
- ⚠️ Blockiert Commit bei Fehlern
- 💡 Kann mit `--no-verify` übersprungen werden:

  ```bash
  git commit --no-verify -m "WIP: incomplete translations"
  ```

### Deaktivieren

```bash
# Temporär
git commit --no-verify

# Permanent
rm .git/hooks/pre-commit
```

---

## 3️⃣ GitHub Actions (Empfohlen für Teams)

### ✅ Bereits konfiguriert

Die Workflow-Datei wurde erstellt: `.github/workflows/translation-check.yml`

### Wann läuft der Check?

1. **Bei jedem Push** auf `main` oder `develop`
2. **Bei jedem Pull Request**
3. **Täglich um 9:00 UTC** (optional)

### Features

- ✅ Automatischer Check bei Code-Änderungen
- ✅ Detaillierter Report bei Fehlern
- ✅ Kommentar im PR bei Problemen
- ✅ Tägliche Überwachung

### Anpassen

```yaml
# In .github/workflows/translation-check.yml

# Andere Branches:
on:
  push:
    branches: [ main, staging, production ]

# Andere Zeiten (z.B. jeden Montag um 8:00):
schedule:
  - cron: '0 8 * * 1'

# Nur bei PR (kein täglicher Check):
on:
  pull_request:
    branches: [ main ]
```

### Status überprüfen

```bash
# Auf GitHub: Repository → Actions → Translation Check
# Oder direkt: https://github.com/mydcc/cachy-app/actions
```

---

## 4️⃣ Cronjob (Server/Entwickler-Maschine)

### Installation

```bash
# Cronjob bearbeiten
crontab -e

# Eintrag hinzufügen (täglich um 9:00):
0 9 * * * cd /pfad/zum/cachy-app && ./check_translations.sh >> /var/log/translation-check.log 2>&1

# Oder mit E-Mail-Benachrichtigung:
0 9 * * * cd /pfad/zum/cachy-app && ./check_translations.sh || echo "Translation check failed!" | mail -s "Cachy Translation Alert" your@email.com
```

### Beispiel-Zeitpläne

```bash
# Jeden Tag um 9:00
0 9 * * * /pfad/zum/check_translations.sh

# Jeden Montag um 8:00
0 8 * * 1 /pfad/zum/check_translations.sh

# Jede Stunde
0 * * * * /pfad/zum/check_translations.sh

# Jeden Werktag um 17:00 (vor Feierabend)
0 17 * * 1-5 /pfad/zum/check_translations.sh
```

### Mit Systemd Timer (modern)

```bash
# /etc/systemd/system/translation-check.service
[Unit]
Description=Translation Check Service
After=network.target

[Service]
Type=oneshot
WorkingDirectory=/pfad/zum/cachy-app
ExecStart=/pfad/zum/cachy-app/check_translations.sh
User=your-user

# /etc/systemd/system/translation-check.timer
[Unit]
Description=Daily Translation Check
Requires=translation-check.service

[Timer]
OnCalendar=daily
OnCalendar=09:00
Persistent=true

[Install]
WantedBy=timers.target

# Aktivieren:
sudo systemctl enable translation-check.timer
sudo systemctl start translation-check.timer
```

---

## 🚀 Empfohlene Setup-Kombinationen

### Für Solo-Entwickler

```bash
# NPM Scripts für manuellen Check
npm run check:translations

# Optional: Pre-Commit Hook
cp scripts/pre-commit.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

### Für kleine Teams

```bash
# GitHub Actions (bereits konfiguriert!)
# + NPM Scripts für lokale Checks
npm run check:translations
```

### Für größere Teams/Production

```bash
# 1. GitHub Actions für CI/CD ✅
# 2. Pre-Commit Hooks für Entwickler
# 3. Cronjob/Systemd auf Production-Server
```

---

## 🧪 Testen der Installation

### 1. NPM Scripts testen

```bash
npm run verify:translations
# Sollte ✅ zeigen

npm run check:translations
# Sollte ohne Fehler durchlaufen
```

### 2. Pre-Commit Hook testen

```bash
# Dummy-Änderung
echo "test" >> src/locales/locales/de.json
git add src/locales/locales/de.json
git commit -m "test"
# Sollte Hook triggern

# Zurücksetzen
git reset HEAD~1
git checkout src/locales/locales/de.json
```

### 3. GitHub Actions testen

```bash
# Einen Commit pushen
git commit --allow-empty -m "test: trigger workflow"
git push origin main

# Auf GitHub Actions Seite beobachten
```

### 4. Shell-Script testen

```bash
chmod +x check_translations.sh
./check_translations.sh
# Sollte ✅ PASSED zeigen
```

---

## 📊 Was wird geprüft?

### Kritische Fehler (blockieren Commit/Build)

- ❌ Fehlende Übersetzungen für Code-Referenzen
- ❌ Keys im Code aber nicht in de.json/en.json
- ❌ Syntax-Fehler in JSON-Dateien

### Warnungen (nur Info)

- ⚠️ Leere Translation-Werte
- ⚠️ Keys nur in einer Sprache
- ℹ️ Möglicherweise ungenutzte Keys

---

## 🔧 Anpassungen

### Check-Script anpassen

```bash
# In check_translations.sh

# Strengere Checks (auch Warnungen als Fehler):
if [ "$EMPTY_VALUES" -gt 0 ]; then
    CRITICAL_ERRORS=$((CRITICAL_ERRORS + 1))
fi

# Weniger streng (nur kritische Fehler):
# Kommentiere die Warnung aus
```

### GitHub Actions anpassen

```yaml
# In .github/workflows/translation-check.yml

# Nur bei Änderungen an Translation-Dateien:
on:
  push:
    paths:
      - 'src/locales/**/*.json'
```

---

## 🐛 Troubleshooting

### "bash: check_translations.sh: Permission denied"

```bash
chmod +x check_translations.sh
```

### "Python 3 ist nicht installiert"

```bash
# Ubuntu/Debian
sudo apt install python3

# macOS
brew install python3
```

### Pre-Commit Hook läuft nicht

```bash
# Hook existiert?
ls -la .git/hooks/pre-commit

# Ausführbar?
chmod +x .git/hooks/pre-commit

# Inhalt korrekt?
cat .git/hooks/pre-commit
```

### GitHub Actions schlagen fehl

```bash
# Lokalen Check ausführen um Problem zu identifizieren
npm run check:translations

# Detaillierte Ausgabe
./check_translations.sh
```

---

## 📝 Best Practices

1. **Vor jedem Commit:**

   ```bash
   npm run check:translations
   ```

2. **Bei größeren Änderungen:**

   ```bash
   npm run audit:translations > translation-report-$(date +%Y%m%d).txt
   ```

3. **In CI/CD Pipeline:**
   - GitHub Actions bereits konfiguriert ✅
   - Zusätzlich in `npm run build` einbauen (optional)

4. **Team-Kommunikation:**
   - Alle Entwickler über Pre-Commit Hook informieren
   - Translation-Policy dokumentieren
   - Bei neuen Features: Beide Sprachen gleichzeitig pflegen

---

## 📅 Empfohlene Zeitpläne

| Kontext | Häufigkeit | Methode |
|---------|-----------|---------|
| Entwicklung | Bei jedem Commit | Pre-Commit Hook |
| Team | Bei Push/PR | GitHub Actions |
| Production | Täglich | GitHub Actions Schedule |
| Server | Täglich 9:00 | Cronjob/Systemd |
| Release | Vor jedem Release | Manuell: `npm run audit:translations` |

---

## ✅ Quick Start Checklist

- [ ] `npm run check:translations` funktioniert
- [ ] Pre-Commit Hook installiert (optional)
- [ ] GitHub Actions läuft bei Push
- [ ] Team über neue Checks informiert
- [ ] Dokumentation gelesen

---

**Stand:** 25. Januar 2026  
**Version:** 1.0  
**Projekt:** cachy-app
