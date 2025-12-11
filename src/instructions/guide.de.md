# Cachy - How-To: Eine Anleitung zur Nutzung des Trading-Rechners

Herzlich willkommen zu Cachy! Hier werden alle Funktionen der Anwendung erklärt, damit du deine Trades optimal planen und verwalten kannst.

**Wichtiger Hinweis zur Datenspeicherung:** Alle deine Eingaben, Presets und Journal-Einträge werden **ausschließlich lokal in deinem Browser** gespeichert. Es werden keine Daten an einen Server gesendet. Das bedeutet, deine Daten sind privat, aber auch, dass sie verloren gehen können, wenn du deine Browserdaten löschst.

---

### 1. Die Grundlagen: Trade-Berechnung

Die Hauptfunktion von Cachy ist die Berechnung deiner Positionsgröße und anderer wichtiger Kennzahlen basierend auf deinem Risiko.

**Schritt 1: Allgemeine Eingaben**

*   **Long/Short:** Wähle die Richtung deines Trades.
*   **Hebel (Leverage):** Gib den Hebel ein, den du verwenden möchtest (z.B. 10 für 10x).
*   **Gebühren (Fees %):** Gib die prozentualen Gebühren deiner Börse an (z.B. 0.04 für 0.04%).

**Schritt 2: Portfolio-Eingaben**

*   **Konto Guthaben (Account Size):** Gib die Gesamtgröße deines Trading-Kontos ein.
*   **Risiko/Trade (%):** Lege fest, wie viel Prozent deines Kontos du bei diesem einen Trade maximal riskieren möchtest (z.B. 1 für 1%).
*   **Risikobetrag:** Dieses Feld zeigt den aus deinem prozentualen Risiko berechneten Geldbetrag an. Du kannst diesen Betrag auch direkt eingeben und sperren.

**Schritt 3: Trade-Setup**

*   **Symbol:** Gib das Handelspaar ein (z.B. BTCUSDT). Klicke auf den Pfeil-Button, um den aktuellen Preis zu laden.
*   **Einstieg (Entry Price):** Der Preis, zu dem du die Position eröffnest.
*   **Stop Loss (SL):** Der Preis, bei dem deine Position zur Verlustbegrenzung automatisch geschlossen wird.
*   **ATR Stop Loss verwenden:** Aktiviere diesen Schalter, um den SL mittels ATR (Average True Range) zu berechnen.
    *   **Manual:** Gib den ATR-Wert und einen Multiplikator manuell ein.
    *   **Auto:** Wähle einen Zeitrahmen (z.B. 1h, 4h). Der aktuelle ATR-Wert wird automatisch geladen.

Sobald alle diese Felder ausgefüllt sind, siehst du die Ergebnisse im rechten Bereich.

---

### 2. Die Ergebnisse verstehen

Cachy berechnet für dich die folgenden Werte:

*   **Positionsgröße (Position Size):** Die Menge des Assets, die du kaufen/verkaufen solltest.
*   **Max. Nettoverlust (Max Net Loss):** Der maximale Geldbetrag, den du verlierst, wenn dein Stop Loss erreicht wird.
*   **Benötigte Margin (Required Margin):** Das Kapital, das für diesen Trade blockiert wird.
*   **Einstiegsgebühr (Entry Fee):** Die geschätzten Gebühren für die Eröffnung der Position.
*   **Gesch. Liquidationspreis (Est. Liquidation Price):** Eine Schätzung, bei welchem Preis deine Position liquidiert würde.
*   **Break-Even-Preis (Break Even Price):** Der Preis, bei dem du ohne Gewinn oder Verlust aussteigst.

---

### 3. Take-Profit (TP) Ziele definieren

Du kannst bis zu 5 Take-Profit-Ziele festlegen, um Teile deiner Position bei bestimmten Preisen zu verkaufen.

*   **Ziel hinzufügen:** Klicke auf den **`+`** Button, um eine neue TP-Zeile hinzuzufügen.
*   **Preis & Prozent:** Gib für jedes Ziel den Preis und den prozentualen Anteil der Position an, der verkauft werden soll.
*   **Automatische Anpassung:** Wenn du den Prozentwert eines Ziels änderst, werden die anderen (nicht gesperrten) Ziele automatisch angepasst, sodass die Summe 100% ergibt.
*   **Prozentsatz sperren:** Klicke auf das Schloss-Symbol, um den Prozentwert eines Ziels zu sperren.

Für jedes gültige TP-Ziel siehst du eine detaillierte Aufschlüsselung mit Kennzahlen wie dem **Netto-Gewinn** und dem **Chance-Risiko-Verhältnis (RRR)**.

---

### 4. Erweiterte Funktionen

Cachy bietet eine Reihe von Werkzeugen, um deinen Workflow zu optimieren.

**Presets (Voreinstellungen)**

*   **Speichern:** Klicke auf den Speichern-Button (Diskettensymbol), um deine aktuellen Eingaben als Preset zu speichern.
*   **Laden:** Wähle ein gespeichertes Preset aus dem Dropdown-Menü aus, um alle Eingabefelder automatisch auszufüllen.
*   **Löschen:** Wähle ein Preset aus und klicke auf den Löschen-Button (Mülleimer), um es zu entfernen.

**Erweiterte Sperr-Funktionen**

Es kann immer nur eine Sperre aktiv sein.

*   **Positionsgröße sperren:** Klicke auf das Schloss-Symbol neben der **Positionsgröße**. Wenn aktiv, bleibt die Positionsgröße konstant. Änderst du den Stop-Loss, werden stattdessen dein **Risiko/Trade (%)** und der **Risikobetrag** angepasst.
*   **Risikobetrag sperren:** Klicke auf das Schloss-Symbol neben dem **Risikobetrag**. Wenn aktiv, bleibt dein maximaler Verlust in Währung konstant. Änderst du den Stop-Loss, werden die **Positionsgröße** und das **Risiko/Trade (%)** angepasst.

**Trade Journal**

*   **Trade hinzufügen:** Klicke auf **"Trade zum Journal hinzufügen"**, um den berechneten Trade zu speichern.
*   **Journal ansehen:** Klicke auf den **"Journal"**-Button oben rechts, um deine Trades anzuzeigen und den Status zu ändern.
*   **Import/Export:** Im Journal-Fenster kannst du dein Journal als **CSV-Datei exportieren** oder eine bestehende CSV-Datei **importieren**.

**Weitere Funktionen**

*   **Theme wechseln:** Mit dem Sonnen-/Mond-Symbol kannst du das Design wechseln.
*   **Sprache wechseln:** Unten links kannst du die Sprache der Benutzeroberfläche ändern.
*   **Alles zurücksetzen:** Der Besen-Button setzt alle Eingabefelder zurück.

---

### 5. Tastaturkürzel (Shortcuts)

*   `Alt + L`: Stellt den Trade-Typ auf **Long** um.
*   `Alt + S`: Stellt den Trade-Typ auf **Short** um.
*   `Alt + R`: Setzt alle Eingaben zurück (**Reset**).
*   `Alt + J`: Öffnet oder schließt das **Journal**.

---

### 6. Marktübersicht (Market Overview)

Die Marktübersicht (Market Overview Card) bietet dir einen schnellen Blick auf die aktuellen Marktdaten für das gewählte Symbol.

*   **Anzeige:** Zeigt den aktuellen Preis, die 24h-Preisänderung (in %), das 24h-Hoch, das 24h-Tief und das 24h-Volumen an.
*   **Symbol-Erkennung:** Fügt automatisch ein 'P'-Suffix hinzu (z.B. BTCUSDTP), wenn es sich um Perpetual-Futures handelt.
*   **Aktualisierung:**
    *   **Manuell:** Klicke auf das Refresh-Symbol, um die Daten manuell zu laden.
    *   **Automatisch:** In den **Einstellungen** kannst du ein Intervall (10s oder 1m) festlegen, damit sich die Daten automatisch im Hintergrund aktualisieren.

---

### 7. Einstellungen

In den Einstellungen (Zahnrad-Symbol) kannst du Cachy an deine Bedürfnisse anpassen.

*   **API Anbieter:** Wähle zwischen **Bitunix** und **Binance** als Datenquelle für Preise und ATR-Werte.
*   **Marktdaten Update:** Lege fest, wie oft die Marktübersicht aktualisiert werden soll (**Manuell**, **Alle 10s**, **Alle 1m**).
*   **Theme & Sprache:** Wähle dein bevorzugtes Design und die Anzeigesprache.
*   **Backup & Wiederherstellung:** Erstelle ein Backup deiner gesamten Daten (inkl. Journal und Presets) als Datei oder stelle Daten aus einer Datei wieder her.
