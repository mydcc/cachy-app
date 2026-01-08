*feedback@cachy.app*

bc1qgrm2kvs27rfkpwtgp5u7w0rlzkgwrxqtls2q4f

***

# Changelog

### Inhaltsverzeichnis
1.  [Version 0.94](#v0.94)
2.  [Version 0.92b2](#v0.92b2)
3.  [Version 0.92b1](#v0.92b1)
4.  [Version 0.92b](#v0.92b)

---

## <a name="v0.94"></a>Version 0.94 (21. Dezember 2025)
- **Neu:** Einstellung "Seitenleisten anzeigen": Blende die Seitenleiste (Favoriten) und Marktübersicht aus, um Platz zu sparen (Desktop & Mobil).
- **Verbesserung:** Optimiertes mobiles Layout mit integrierter Positionsansicht.
- **Fix:** Korrektur bei der Berechnung "Offener Positionen" für Bitunix (Fehlerbehebung beim 'Side'-Parameter).
- **System:** Verbesserte interne Datenstruktur für Einstellungen und API-Keys.
- **Neu:** Backup & Wiederherstellung: Erstelle Backups deiner Daten (Einstellungen, Journal, Presets) und stelle sie bei Bedarf wieder her.
- **Verbesserung:** Eingabe für "Risiko/Trade" unterstützt jetzt bis zu 2 Nachkommastellen.
- **Verbesserung:** Allgemeine Stabilitätsverbesserungen.
- **Neu:** Favoriten-Funktion: Speichere bis zu 4 Symbole durch Klick auf das Stern-Symbol in der Marktübersicht. Favoriten werden in der Sidebar (Desktop) oder mobil unter der Hauptkarte angezeigt.
- **Neu:** Automatisches Abrufen des Kontostands beim Start (aktivierbar in den Einstellungen, erfordert API-Keys).
- **Neu:** Automatische Preisaktualisierung im Eingabefeld (optional).
- **Fix:** Behebung von Deployment-Problemen (502 Fehler) und verbesserte Stabilität.

---

## <a name="v0.92b2"></a>Version 0.92b2 (11. Dezember 2025)
- **Neu:** "Marktübersicht" (Market Overview) zeigt 24h-Daten (Preis, Volumen, Änderung) für das aktuelle Symbol an.
- **Neu:** Einstellungen erweitert: Auswahl des API-Anbieters (Bitunix/Binance) und Intervall für Marktdaten-Updates (1s, 1m, 10m).

---

## <a name="v0.92b1"></a>Version 0.92b1 (04. September 2025)
- **Neu:** Automatischer ATR-Abruf von der Binance-API mit wählbarem Zeitrahmen (5m, 15m, 1h, 4h, 1d). Der abgerufene Wert kann manuell angepasst werden.
- **Neu:** Erweiterte Sperr-Funktionen: Der Risikobetrag in Währung kann jetzt gesperrt werden, um die Positionsgröße und das Risiko in % zu berechnen.
- **Neu:** Tastaturkürzel (`Alt+L/S/R/J`) für schnellere Bedienung hinzugefügt.
- **Neu:** Modalfenster können jetzt mit der `Escape`-Taste oder per Klick auf den Hintergrund geschlossen werden.

---

## <a name="v0.92b"></a>Version 0.92b (22. August 2025)
- **Verbesserung:** Eingabefeld für Symbol akzeptiert jetzt Buchstaben und Zahlen.
- **Behoben:** Rand der Tooltips ist jetzt themenabhängig und das Problem des doppelten Randes wurde behoben.
- **Verbesserung:** Buttons "Trade zum Journal hinzufügen" und "Anleitung anzeigen" sind jetzt themenabhängig.
