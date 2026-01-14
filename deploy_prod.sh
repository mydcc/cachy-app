#!/bin/bash
clear
echo "--- Deployment gestartet: prodcachyapp ---"

# 1. Verzeichnis
cd /www/wwwroot/cachy.app || exit 1
echo "[1/6] Verzeichnis: /www/wwwroot/cachy.app"

# 2. Git Update
echo "[2/6] Git: Hole neueste Änderungen..."
git reset --hard HEAD
git pull

# 3. Dependencies
echo "[3/6] NPM: Installiere Dependencies..."
npm install --legacy-peer-deps

# 4. Build
echo "[4/6] Build: Generiere Produktions-Build..."
npm run build
if [ $? -eq 0 ]; then
    echo "  -> Build erfolgreich."
else
    echo "  -> Build FEHLGESCHLAGEN."; exit 1
fi

# 5. Rechte
echo "[5/6] System: Setze Dateirechte (www:www)..."
chown -R www:www /www/wwwroot/cachy.app
chmod -R 755 /www/wwwroot/cachy.app

# 6. Restart
echo "[6/6] Restart: Triggere aaPanel-Startskript..."
fuser -k 3001/tcp > /dev/null 2>&1
sudo -u www bash /www/server/nodejs/vhost/scripts/prodcachyapp.sh > /dev/null 2>&1

echo ""
echo "✅ PRODUKTIONS-Deployment beendet. Bitte cachy.app prüfen."
