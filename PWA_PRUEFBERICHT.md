# PWA Prüfbericht (PWA Audit Report)

## Status
Der Fehler "Weißer Splashscreen" ist ein starker Indikator dafür, dass Android die App nicht als vollwertige **WebAPK**, sondern nur als **Browser-Shortcut** installiert hat.

Ein Browser-Shortcut entsteht, wenn:
1.  Der **Service Worker** nicht erfolgreich installiert werden konnte.
2.  Die **Manifest-Datei** nicht geladen oder geparst werden konnte.
3.  Die App nicht über **HTTPS** läuft.

## Durchgeführte Maßnahmen

### 1. Manifest Konfiguration
*   **Datei:** `static/site.webmanifest` (umbenannt von `.json`, um Cache-Probleme zu umgehen).
*   **Hintergrund:** `"background_color": "#0f172a"` ist korrekt gesetzt (Dunkelblau).
*   **Icons:** Es werden nun Icons für beide Zwecke bereitgestellt:
    *   `purpose: "any"` (für Standard-Icons).
    *   `purpose: "maskable"` (für adaptive Android Icons).
    Dies stellt sicher, dass Android immer ein passendes Icon findet.

### 2. Service Worker Optimierung (Kritisch)
Ich habe die Datei `src/service-worker.ts` überarbeitet:
*   **Fehlertoleranz:** Bisher führte ein einziger Fehler beim Cachen von Dateien (z.B. ein fehlendes Bild) dazu, dass der Service Worker komplett abstürzte. Die neue Version fängt diese Fehler ab und versucht zumindest die kritischen Dateien zu laden.
*   **Schnellere Aktivierung:** `self.skipWaiting()` und `self.clients.claim()` wurden hinzugefügt. Das sorgt dafür, dass die App sofort nach dem Laden als "installiert" gilt und nicht erst beim zweiten Besuch. Das erhöht die Chance massiv, dass beim Klick auf "Installieren" sofort die WebAPK (mit richtigem Splashscreen) erzeugt wird.

### 3. HTML Links
*   Die Verknüpfung in `src/app.html` ist korrekt auf `/site.webmanifest` gesetzt.
*   Mobile Meta-Tags für iOS (`apple-mobile-web-app-capable`) sind vorhanden.

## Empfehlung für den Test
Bitte führe folgende Schritte exakt durch, um die Änderung zu validieren:

1.  **Alte App löschen:** Entferne die "Cachy" App von deinem Homescreen/App-Drawer.
2.  **Browser Daten löschen (Wichtig):**
    *   Gehe in Chrome/Brave auf `Einstellungen` -> `Datenschutz` -> `Browserdaten löschen`.
    *   Lösche "Bilder und Dateien im Cache" für "Gesamte Zeit".
3.  **Seite neu laden:** Öffne `https://cachy.app` (oder deine URL) neu.
4.  **Warten:** Warte kurz (ca. 5-10 Sekunden), damit der Service Worker im Hintergrund laden kann.
5.  **Installieren:** Tippe im Browser-Menü auf "App installieren".
    *   *Hinweis:* Wenn dort nur "Zum Startbildschirm hinzufügen" steht, ist der Service Worker noch nicht bereit oder HTTPS fehlt. Es sollte idealerweise "App installieren" heißen.

Sollte der Splashscreen danach immer noch weiß sein, liegt es höchstwahrscheinlich am **Icon selbst** (dass es zu viel transparente Fläche hat und Android deshalb den Hintergrund weiß auffüllt). In diesem Fall müssten wir das PNG-Bild bearbeiten und den Hintergrund direkt im Bild dunkel färben. Aber technisch ist von Code-Seite nun alles korrekt.
