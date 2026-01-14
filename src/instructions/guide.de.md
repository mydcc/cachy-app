# Cachy - Benutzerhandbuch

Willkommen bei Cachy! Dieses Handbuch ist deine umfassende Anleitung, um die App effektiv für dein Trading zu nutzen. Es deckt alles ab, von der grundlegenden Positionsberechnung bis hin zur fortgeschrittenen Performance-Analyse.

**Datenschutz-Hinweis:** Cachy läuft vollständig lokal (client-seitig). Alle deine Daten (Einstellungen, Journal, API-Schlüssel) werden lokal in deinem Browser (`localStorage`) gespeichert. Es werden keine Daten an externe Server gesendet (außer direkte API-Anfragen an die von dir konfigurierten Börsen).

---

## 1. Trading Rechner

Der Kern von Cachy ist der Präzisionsrechner, der dir hilft, dein Risiko zu managen und deine Positionsgrößen korrekt zu bestimmen.

### Eingaben

Der Rechner ist in drei Hauptbereiche unterteilt:

#### A. Allgemeine Eingaben (General)

- **Long/Short:** Wähle deine Handelsrichtung.
- **Hebel (Leverage):** Gib deinen Hebel ein (z.B. `10` für 10x). Dies beeinflusst die **Erforderliche Margin**.
- **Gebühren (Fees %):** Gib den Gebührensatz deiner Börse ein (z.B. `0.06`). Dieser wird verwendet, um Break-Even-Preise und geschätzte Kosten zu berechnen.

#### B. Portfolio Eingaben

- **Kontogröße:** Dein gesamtes Handelskapital.
  - _Tipp:_ Wenn du deine API-Schlüssel verbindest, kann dies automatisch abgerufen werden.
- **Risiko pro Trade (%):** Der Prozentsatz deines Kontos, den du bereit bist zu verlieren, wenn der Stop-Loss getroffen wird.
- **Risikobetrag ($):** Der absolute Dollarbetrag, den du bereit bist zu verlieren.

**Der Sperr-Mechanismus (Locking):**
Cachy erlaubt es dir, bestimmte Variablen zu sperren ("locken"), um sie an deinen Workflow anzupassen:

- **Risikobetrag sperren (\$):** Nützlich, wenn du immer einen festen Dollarbetrag riskieren möchtest (z.B. 50 \$), unabhängig vom Stop-Loss-Abstand. Der Rechner passt deine Positionsgröße entsprechend an.
- **Positionsgröße sperren:** Nützlich, wenn du eine feste Menge handeln möchtest (z.B. 1 BTC). Der Rechner zeigt dir dann, wie hoch dein Risiko (%) basierend auf deinem Stop-Loss ist.

#### C. Trade Setup

- **Symbol:** Das Handelspaar (z.B. `BTCUSDT`).
- **Einstiegspreis (Entry):** Dein geplanter Einstiegspreis.
- **Stop Loss (SL):** Der Preis, an dem dein Trade ungültig wird.
  - **ATR Modus:** Aktiviere `Use ATR`, um automatisch einen Stop-Loss basierend auf der Marktvolatilität (Average True Range) zu berechnen. Du kannst den Zeitrahmen (z.B. `15m`, `1h`) und einen Multiplikator (z.B. `1.5` x ATR) wählen.

### Formeln

Hier ist, wie Cachy die wichtigsten Kennzahlen für dich berechnet:

**1. Risikobetrag**
$$ \text{Risikobetrag} = \text{Kontogröße} \times \frac{\text{Risiko \%}}{100} $$

**2. Risiko pro Einheit**
$$ \text{Risiko pro Einheit} = |\text{Einstiegspreis} - \text{Stop Loss}| $$

**3. Positionsgröße**
$$ \text{Positionsgröße} = \frac{\text{Risikobetrag}}{\text{Risiko pro Einheit}} $$

**4. Ordervolumen (Notional Value)**
$$ \text{Ordervolumen} = \text{Positionsgröße} \times \text{Einstiegspreis} $$

**5. Erforderliche Margin**
$$ \text{Erforderliche Margin} = \frac{\text{Ordervolumen}}{\text{Hebel}} $$

**6. Break-Even Preis (Long)**
$$ \text{Break Even} = \text{Einstiegspreis} \times \frac{1 + \text{Gebührenrate}}{1 - \text{Gebührenrate}} $$

---

## 2. Marktübersicht & Sidebar

Cachy bietet Werkzeuge, um den Markt in Echtzeit im Blick zu behalten.

### Marktübersicht (Market Overview)

Dieses Panel befindet sich oben (oder mobil über die Sidebar erreichbar) und zeigt Echtzeitdaten für das gewählte Symbol:

- **Live Preis:** Aktualisiert sich in Echtzeit über Websockets (wenn Bitunix ausgewählt ist).
- **24h Statistiken:** Änderung %, Hoch, Tief und Volumen.
- **Funding Rate:** Aktuelle Finanzierungsrate (grün = positiv, rot = negativ).
- **Countdown:** Zeit bis zur nächsten Funding-Zahlung.

### Technicals Panel

Dieses Panel bietet tiefergehende technische Analysen (Oszillatoren & Pivots).

**Was stehen dort für Daten?**
In dem "Technicals" Panel siehst du zwei Arten von Indikatoren:

- **Oszillatoren (RSI, Stochastic, CCI...):** Diese messen das "Momentum" (Schwung) des Preises. Sie zeigen an, ob ein Markt "überkauft" (zu teuer, könnte fallen -> Sell) oder "überverkauft" (zu billig, könnte steigen -> Buy) ist. Diese Werte dürfen sich live ändern, aber nicht sprunghaft.
- **Pivots (P, R1, S1...):** Das sind statische Preislevels, die als Unterstützung (Support - S) oder Widerstand (Resistance - R) dienen.

**Wofür und wie werden Pivot-Punkte berechnet?**
Pivot-Punkte dienen als Orientierungshilfe. Trader nutzen sie, um Ziele für Gewinne (Take Profit bei R1/R2) oder Einstiege zu finden. Sie werden rein mathematisch aus der vorherigen Kerze berechnet (deshalb müssen sie fix sein, solange die aktuelle Kerze läuft).

**Die Basis-Formel (Classic):**

- **P (Pivot Point):** Der Durchschnittspreis der letzten Periode.

  $$ P = \frac{\text{High} + \text{Low} + \text{Close}}{3} $$

- **R1 (Erster Widerstand):**
  $$ R1 = (2 \times P) - \text{Low} $$
- **S1 (Erste Unterstützung):**
  $$ S1 = (2 \times P) - \text{High} $$

### Favoriten

Du kannst bis zu **4 Favoriten** für den schnellen Zugriff speichern.

- **Hinzufügen:** Klicke auf das Stern-Symbol in der Marktübersicht.
- **Zugriff:** Klicke auf einen Favoriten in der Sidebar (Desktop) oder der Favoritenleiste (Mobil), um ihn sofort in den Rechner zu laden.

### Sidebar (Positionen)

Die Sidebar bietet einen umfassenden Überblick über deine aktive Handelsumgebung:

- **Offene Positionen:** Zeigt aktive Positionen, die von deiner Börse synchronisiert wurden.
- **Offene Orders:** Zeigt ausstehende Limit- oder Stop-Orders.
- **Verlauf (History):** Zeigt die jüngste Handelshistorie.
- **TP/SL:** Eigener Tab zur Verwaltung von Take-Profit- und Stop-Loss-Orders (Bitunix).

---

## 3. Trade Journal

Das Journal ist der Ort, an dem du deine Performance verfolgst. Es unterstützt sowohl manuelle Einträge als auch automatische Synchronisation.

### Manuell vs. Synchronisiert

- **Manuell:** Du klickst nach der Berechnung eines Trades auf "Zum Journal hinzufügen". Du aktualisierst den Status (Gewonnen/Verloren) und den Ausstiegspreis später manuell.
- **Synchronisiert (Bitunix):** Wenn du Bitunix nutzt und API-Schlüssel konfiguriert hast, kann Cachy deine Handelshistorie automatisch importieren, inklusive realisiertem PnL und Gebühren.

### Performance Tracking (Pro)

Nutzer mit Pro-Status haben Zugriff auf erweiterte Analysen im Journal:

#### Dashboard Diagramme

- **Equity Curve:** Visualisiert das Wachstum deines Kontostands über die Zeit.
- **Drawdown:** Zeigt den prozentualen Rückgang vom Höchststand deines Kontos.
- **Monthly PnL:** Balkendiagramm der Gewinne/Verluste aggregiert nach Monat.

#### Deep Dive Analysen

Der "Deep Dive"-Bereich bietet detaillierte Einblicke in dein Verhalten:

- **Timing:** Analysiere, zu welcher Tageszeit oder an welchem Wochentag du am profitabelsten bist.
- **Assets:** Ein Blasendiagramm, das zeigt, welche Coins am besten performen (Win Rate vs PnL).
- **Risk:** Streudiagramm, das Risikobetrag mit realisiertem PnL korreliert. Riskierst du zu viel bei Verlusttrades?
- **Strategies:** Tagge deine Trades (z.B. "Breakout", "Reversal") und sieh, welche Strategien die besten Ergebnisse liefern.
- **Psychology:** Verfolgt Gewinn- und Verlustserien, um dir zu helfen, "Tilt" oder "Flow"-Zustände zu erkennen.

---

## 4. Einstellungen & Konfiguration

Zugriff auf die Einstellungen über das Zahnrad-Symbol.

### API Provider

- **Bitunix (Empfohlen):** Unterstützt volle Websocket-Integration (Echtzeitdaten), Positionssynchronisation und Order-Management.
- **Binance:** Unterstützt Marktdaten und einfachen Kontostandsabruf.

### Datensicherung (Backup)

Da Cachy nur lokal läuft, liegt die Verantwortung für deine Daten bei dir.

- **Backup:** Gehe zu Einstellungen -> System -> **Backup erstellen**. Dies lädt eine JSON-Datei mit all deinen Einstellungen, Journaleinträgen und Presets herunter.
- **Wiederherstellen (Restore):** Nutze **Aus Backup wiederherstellen**, um eine zuvor gespeicherte JSON-Datei zu laden.

### Anpassung

- **Themes:** Wähle aus über 20 verschiedenen Designs (z.B. 'Midnight', 'Dracula', 'Nord').
- **Hotkeys:** Passe Tastaturkürzel für Geschwindigkeit an (z.B. `S` für Short, `L` für Long).
- **Debug-Modus:** Aktiviere detaillierte System-Logs in der Browser-Konsole für die Fehlerdiagnose.

### Side Panel (Seitenleiste)

Wähle unter **Einstellungen -> Sidebar** zwischen:

- **Private Notizen:** Speichere Notizen nur lokal in deinem Browser.
- **Globaler Chat:** Interagiere mit anderen Nutzern (erfordert API-Anbindung).

---

_Happy Trading!_
