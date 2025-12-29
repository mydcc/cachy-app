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

*   **Konto Guthaben (Account Size):** Gib die Gesamtgröße deines Trading-Kontos ein. Du kannst dein Guthaben auch automatisch abrufen lassen, wenn du deine API-Keys hinterlegt hast (siehe Einstellungen).
*   **Risiko/Trade (%):** Lege fest, wie viel Prozent deines Kontos du bei diesem einen Trade maximal riskieren möchtest (z.B. 1 für 1% oder 1.25 für 1.25%). Dieses Feld unterstützt bis zu 2 Nachkommastellen.
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

> **Warum ist meine Positionsgröße so groß?**
>
> Wenn dein Stop-Loss sehr nah an deinem Einstiegspreis liegt, muss die Positionsgröße sehr hoch sein, um dein festgelegtes Risiko (z.B. 10$) zu erreichen.
>
> **Warnung: "Guthaben nicht ausreichend"**
>
> Wenn die berechnete Positionsgröße mehr Kapital (Margin) erfordert, als du auf dem Konto hast, zeigt Cachy eine rote Warnung an. In diesem Fall musst du entweder dein Risiko verringern oder den Hebel erhöhen (Vorsicht!).

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

### 6. Marktübersicht (Market Overview) & Favoriten

Die Marktübersicht bietet dir einen schnellen Blick auf die aktuellen Marktdaten für das gewählte Symbol.

*   **Anzeige:** Zeigt den aktuellen Preis, die 24h-Preisänderung (in %), das 24h-Hoch, das 24h-Tief und das 24h-Volumen an.
*   **Symbol-Erkennung:** Fügt automatisch ein 'P'-Suffix hinzu (z.B. BTCUSDTP), wenn es sich um Perpetual-Futures handelt.
*   **Favoriten:** Klicke auf das **Stern-Symbol**, um das aktuelle Symbol zu deiner Favoritenliste hinzuzufügen (maximal 4). Gespeicherte Favoriten erscheinen in der Seitenleiste (Desktop) oder unter der Hauptkarte (Mobil) und können per Klick direkt in den Rechner geladen werden.
*   **Aktualisierung:**
    *   **Manuell:** Klicke auf das Refresh-Symbol, um die Daten manuell zu laden.
    *   **Automatisch:** In den **Einstellungen** kannst du ein Intervall festlegen, damit sich die Daten automatisch im Hintergrund aktualisieren.

---

### 7. Einstellungen

In den Einstellungen (Zahnrad-Symbol) kannst du Cachy an deine Bedürfnisse anpassen.

*   **Sprache:** Wähle zwischen Deutsch und Englisch.
*   **API Anbieter:** Wähle zwischen **Bitunix** (Standard) und **Binance** als Datenquelle für Preise und ATR-Werte.
*   **API Integration:**
    *   Hinterlege deine API Keys für Bitunix oder Binance (Key & Secret).
    *   **Guthaben beim Laden abrufen:** Wenn aktiviert, wird dein Kontostand beim Starten der App automatisch abgerufen (erfordert API Keys).
    *   **Automatische Preisaktualisierung (Eingabefeld):** Wenn aktiviert, wird der Preis im Eingabefeld "Kaufpreis" regelmäßig aktualisiert, solange du das Feld nicht bearbeitest.
*   **Marktdaten Update:** Lege fest, wie oft die Marktübersicht und Preise aktualisiert werden sollen (**1s**, **1m**, **10m**).
*   **Theme:** Wähle dein bevorzugtes Design.
*   **Backup & Wiederherstellung:** Erstelle ein Backup deiner gesamten Daten (inkl. Journal und Presets) als JSON-Datei oder stelle Daten aus einer Datei wieder her.
*   **Seitenleisten anzeigen:** Du kannst die Seitenleisten (Favoriten/Marktübersicht) ausblenden, um mehr Platz für den Rechner zu haben. Dies betrifft sowohl die Desktop-Ansicht (rechte Spalte) als auch die mobile Ansicht (unterer Bereich).
