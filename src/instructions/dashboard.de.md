# Cachy Dashboard: Dein Trading-Cockpit

Willkommen bei Cachy! Das Dashboard ist deine zentrale Steuerzentrale für professionelles Crypto-Trading. Hier planst du deine Trades mit präzisen Berechnungen, führst dein Journal und behältst den Überblick über deine Performance.

Diese Anleitung zeigt dir, wie du das Dashboard optimal nutzt, um dein Trading auf das nächste Level zu heben.

---

### Inhaltsverzeichnis

1. [Dashboard-Übersicht](#dashboard-uebersicht)
   - [Hauptbereiche](#hauptbereiche)
   - [Navigation](#navigation)
2. [Der Position Calculator](#position-calculator)
   - [Standard-Workflow: Positionsgröße berechnen](#standard-workflow)
   - [Lock-Funktionen](#lock-funktionen)
   - [ATR Stop-Loss](#atr-stop-loss)
   - [Multiple Take-Profits](#multiple-take-profits)
   - [Risk/Reward Ratio](#risk-reward-ratio)
3. [Vom Calculator zum Journal](#calculator-zum-journal)
4. [Der Trading-Workflow](#trading-workflow)
5. [Best Practices & Tipps](#best-practices)

---

<a id="dashboard-uebersicht"></a>
## 1. Dashboard-Übersicht

Das Cachy Dashboard ist deine All-in-One-Lösung für diszipliniertes Trading. Es kombiniert präzise Berechnungen mit umfassender Performance-Analyse.

<a id="hauptbereiche"></a>
### Hauptbereiche

Das Dashboard besteht aus drei Hauptbereichen:

**📊 Home / Dashboard**
- Übersicht und Schnellzugriff
- Account-Balance-Anzeige
- Zugriff auf alle Tool-Bereiche

**🧮 Position Calculator**
- Präzise Positionsgrößen-Berechnung
- Risikomanagement-Tools
- ATR-basierte Stop-Loss-Berechnung
- Multiple Take-Profit-Planung

**📖 Trading Journal**
- Detaillierte Trade-Historie
- Performance-Analysen und Charts
- Tag-basierte Strategie-Auswertung
- Deep Dive Analytics (Pro)

<a id="navigation"></a>
### Navigation

**Sidebar-Menü (links):**
- **Home:** Zurück zur Startseite
- **Calculator:** Öffnet den Position Size Calculator
- **Journal:** Öffnet dein Trading Journal
- **Settings:** Theme, Sprache, Account-Einstellungen

**Top-Bar:**
- **Account Balance:** Zeigt dein aktuelles Kapital
- **Theme Toggle:** Wechsel zwischen Light/Dark/VIP Themes
- **Sprach-Umschalter:** DE/EN
- **Help:** Zugriff auf diese Anleitung

---

<a id="position-calculator"></a>
## 2. Der Position Calculator

Der Calculator ist das Herzstück deines Risikomanagements. Er berechnet für dich, wie groß deine Position sein muss, um exakt dein gewünschtes Risiko einzuhalten.

**Warum ist das wichtig?**
Erfolgreiches Trading ist kein Glücksspiel – es ist ein Geschäft mit diszipliniertem Risikomanagement. Der Calculator stellt sicher, dass du **nie zu viel riskierst** und immer genau weißt, was du tust.

<a id="standard-workflow"></a>
### Standard-Workflow: Positionsgröße berechnen

Dies ist der häufigste Anwendungsfall. Du gibst vor, wie viel Prozent deines Kapitals du riskieren möchtest, und der Calculator berechnet die **exakte Positionsgröße**.

#### Beispiel-Szenario:

**Deine Eingaben:**
- **Account Balance:** 10.000 €
- **Risk per Trade:** 1% (= 100 €)
- **Symbol:** BTC/USDT
- **Trade Type:** Long
- **Entry Price:** 50.000 €
- **Stop-Loss:** 49.500 €

#### Die Berechnung in 3 Schritten:

**Schritt 1: Risikobetrag in €**
```
Risikobetrag = Account Balance × (Risk % / 100)
Beispiel: 10.000 € × 0.01 = 100 €
```

**Schritt 2: Risiko pro Einheit**
```
Risiko pro Einheit = |Entry Price - Stop-Loss Price|
Beispiel: |50.000 - 49.500| = 500 €
```

**Schritt 3: Positionsgröße**
```
Position Size = Risikobetrag / Risiko pro Einheit
Beispiel: 100 € / 500 € = 0,2 BTC
```

**✅ Ergebnis:** Du kaufst **0,2 BTC** bei 50.000 €, mit einem Stop-Loss bei 49.500 €. Dein maximales Risiko beträgt exakt 100 € (1% deines Kapitals).

**Der Vorteil:** Kein Raten, kein "ungefähr". Du weißt **auf den Cent genau**, dass du dein Risikolimit einhältst.

---

<a id="lock-funktionen"></a>
### Lock-Funktionen: Alternative Workflows

Manchmal möchtest du die Berechnung andersherum durchführen. Dafür gibt es die **Lock-Buttons** (🔒).

#### Szenario A: Risk Amount sperren

**Wann nutzen?**
Wenn du in **festen Geldbeträgen** denkst: "Ich riskiere heute 50 €" (statt in Prozent).

**Wie es funktioniert:**
1. Klicke auf das 🔒 neben "Risk Amount"
2. Gib deinen gewünschten Betrag ein (z.B. 50 €)
3. Das Feld "Risk per Trade %" wird automatisch angepasst

**Vorteil:** Flexibilität für Trader, die ihr Risiko lieber in absoluten Beträgen planen.

#### Szenario B: Position Size sperren

**Wann nutzen?**
Wenn du eine **feste Positionsgröße** handeln möchtest (z.B. immer 1 ganze Coin, immer 0,5 ETH).

**Wie es funktioniert:**
1. Klicke auf das 🔒 neben "Position Size"
2. Gib deine gewünschte Größe ein
3. Passe Entry und Stop-Loss an
4. Der Calculator zeigt dir nun **rückwärts**, wie hoch dein Risiko bei dieser Größe ist

**Vorteil:** Perfekt für Strategien mit festen Handelsgrößen. Du siehst sofort die Risiko-Konsequenzen.

---

<a id="atr-stop-loss"></a>
### ATR Stop-Loss: Volatilitäts-basierte Stop-Platzierung

Der **ATR (Average True Range)** Stop-Loss hilft dir, deinen Stop intelligent an die aktuelle Marktvolatilität anzupassen.

#### Was ist der ATR?

Der ATR misst die **durchschnittliche Preisschwankung** über einen Zeitraum:
- **Hoher ATR** = Hohe Volatilität (Markt bewegt sich stark)
- **Niedriger ATR** = Geringe Volatilität (Markt bewegt sich ruhig)

#### Berechnung:

Für die letzten 14 Perioden wird jeweils die "True Range" berechnet:
```
True Range = Maximum von:
1. Aktuelles Hoch - Aktuelles Tief
2. |Aktuelles Hoch - Vorheriger Schlusskurs|
3. |Aktuelles Tief - Vorheriger Schlusskurs|

ATR = Durchschnitt der 14 True Ranges
```

#### So nutzt du es:

1. **Aktiviere** "ATR Stop-Loss"
2. **Wähle den Modus:**
   - **Auto:** Calculator holt automatisch den aktuellen ATR-Wert vom Exchange
   - **Manual:** Du gibst einen eigenen ATR-Wert ein
3. **Setze den Multiplikator** (typisch: 1,5 - 2,5)
4. **Stop-Loss wird berechnet:**
   ```
   Long:  Stop-Loss = Entry - (ATR × Multiplikator)
   Short: Stop-Loss = Entry + (ATR × Multiplikator)
   ```

#### Beispiel:

- Entry: 50.000 €
- ATR: 800 €
- Multiplikator: 2
- **Stop-Loss (Long):** 50.000 - (800 × 2) = **48.400 €**

**Vorteil:** Dein Stop passt sich intelligent an:
- Bei hoher Volatilität → Mehr Raum zum Atmen
- Bei niedriger Volatilität → Engerer Stop, weniger Risiko

---

<a id="multiple-take-profits"></a>
### Multiple Take-Profits: Schrittweiser Ausstieg

Professionelle Trader verkaufen ihre Position nicht auf einmal, sondern **schrittweise an mehreren Zielen**.

#### Wie es funktioniert:

**Definiere bis zu 3 Take-Profit-Ziele:**

**Take-Profit 1:**
- Price: 52.000 €
- Exit %: 50% (Du verkaufst die Hälfte)
- R/R: 4:1

**Take-Profit 2:**
- Price: 54.000 €
- Exit %: 30%
- R/R: 8:1

**Take-Profit 3:**
- Price: 56.000 €
- Exit %: 20%
- R/R: 12:1

#### Der Calculator zeigt dir:

1. **Individual R/R** für jedes Ziel
2. **Weighted R/R** (Durchschnitt, gewichtet nach Exit %)
3. **Total Expected Profit** bei allen Zielen

**Vorteil:**
- Du sicherst Gewinne frühzeitig (TP1)
- Lässt Gewinner laufen (TP2, TP3)
- Optimales Risiko-zu-Gewinn-Verhältnis

---

<a id="risk-reward-ratio"></a>
### Risk/Reward Ratio (R/R): Die wichtigste Kennzahl

Das R/R-Verhältnis zeigt dir, wie viel du im Verhältnis zu deinem Risiko gewinnen kannst.

#### Was bedeutet es?

- **1:1** → Du riskierst 100 €, um 100 € zu gewinnen
- **2:1** → Du riskierst 100 €, um 200 € zu gewinnen
- **3:1** → Du riskierst 100 €, um 300 € zu gewinnen

#### Warum ist es wichtig?

**Mathematisches Beispiel:**

Mit **50% Win Rate** und **2:1 R/R**:
- 10 Trades: 5 Gewinner × 200 € = 1.000 €
- 10 Trades: 5 Verlierer × 100 € = -500 €
- **Netto: +500 € Gewinn**

Mit **50% Win Rate** aber **1:1 R/R**:
- 10 Trades: 5 Gewinner × 100 € = 500 €
- 10 Trades: 5 Verlierer × 100 € = -500 €
- **Netto: ±0 € (Breakeven)**

**Die Regel:** 
- R/R < 1:1 → Langfristig verlierst du Geld
- R/R ≥ 2:1 → Gute Trading-Chancen
- R/R ≥ 3:1 → Exzellente Setups

**Der Calculator zeigt dir:**
- Individual R/R für jedes TP
- Weighted Average R/R für den gesamten Trade

**Cachy zwingt dich**, über dein R/R nachzudenken – das ist der Schlüssel zu langfristigem Erfolg!

---

<a id="calculator-zum-journal"></a>
## 3. Vom Calculator zum Journal

Der Calculator plant deinen Trade – das **Journal dokumentiert und analysiert** ihn.

### Der perfekte Workflow:

1. **Calculator:** Trade planen
   - Position Size berechnen
   - Stop-Loss und TPs festlegen
   - R/R prüfen

2. **Broker:** Trade ausführen
   - Order platzieren basierend auf Calculator-Werten

3. **Journal:** Trade dokumentieren
   - Automatischer Import (Bitunix API)
   - Oder manuelles Hinzufügen
   - Tags hinzufügen (Strategie, Setup, etc.)
   - Screenshot hochladen

4. **Journal:** Trade analysieren
   - Performance-Charts ansehen
   - Strategien vergleichen
   - Fehler identifizieren
   - Optimierungen ableiten

### Schnellzugriff:

- Klicke auf **"Journal"** in der Sidebar
- Oder nutze den Button **"Save to Journal"** (wenn verfügbar)

---

<a id="trading-workflow"></a>
## 4. Der Trading-Workflow: Plan → Execute → Analyze

Erfolgreiches Trading ist ein **wiederholbarer Prozess**:

### Phase 1: PLAN (Calculator)

**Vor jedem Trade:**
1. Definiere dein Risiko (z.B. 1%)
2. Identifiziere Entry-Punkt
3. Setze Stop-Loss (manuell oder ATR)
4. Definiere Take-Profit(s)
5. Prüfe das R/R-Verhältnis
   - R/R < 2:1? → Trade überspringen!
   - R/R ≥ 2:1? → Trade ist gültig

**✅ Regel:** Nie einen Trade ohne vorherige Berechnung eingehen!

### Phase 2: EXECUTE (Broker)

**Beim Broker:**
1. Order platzieren mit exakten Werten aus Calculator
2. Stop-Loss und TPs setzen
3. Notizen machen (Setup, Gefühl, etc.)

**✅ Regel:** Halte dich strikt an deinen Plan!

### Phase 3: DOCUMENT (Journal)

**Nach Trade-Abschluss:**
1. Trade ins Journal eintragen
   - Automatisch via API-Sync
   - Oder manuell hinzufügen
2. Tags hinzufügen:
   - Strategie: `Breakout`, `Support/Resistance`, etc.
   - Fehler: `FOMO`, `Revenge`, etc.
3. Screenshot hochladen
4. Notizen ergänzen

**✅ Regel:** Dokumentiere JEDEN Trade, auch Verlierer!

### Phase 4: ANALYZE (Journal Deep Dive)

**Wöchentlich/Monatlich:**
1. Performance-Charts ansehen
2. Win Rate und Profit Factor prüfen
3. Strategien vergleichen (welche Tags funktionieren?)
4. Zeitanalyse (welche Tageszeiten sind profitabel?)
5. Fehler identifizieren und eliminieren

**✅ Regel:** Lass die Daten deine Entscheidungen leiten, nicht dein Bauchgefühl!

---

<a id="best-practices"></a>
## 5. Best Practices & Tipps

### ✅ DO's (Mach das!)

**Im Calculator:**
- ✅ **Nutze ihn IMMER** vor jedem Trade
- ✅ **Halte dein Risiko konstant** (z.B. immer 1%)
- ✅ **Prüfe das R/R** – nur Trades ≥ 2:1 eingehen
- ✅ **Nutze ATR** für intelligente Stop-Platzierung
- ✅ **Multiple TPs** für besseres Risk Management

**Im Journal:**
- ✅ **Dokumentiere jeden Trade** sofort nach Abschluss
- ✅ **Nutze Tags** konsequent für Strategien und Fehler
- ✅ **Screenshots hochladen** für visuelle Analyse
- ✅ **Wöchentliche Reviews** durchführen
- ✅ **Lerne aus Verlusten** – sie sind deine besten Lehrer

### ❌ DON'Ts (Vermeide das!)

**Im Calculator:**
- ❌ **Keine Trades** ohne vorherige Berechnung
- ❌ **Nicht abweichen** vom berechneten Plan
- ❌ **Kein "Bauchgefühl"** bei Position Sizes
- ❌ **Keine Trades mit R/R < 1:1** eingehen

**Im Journal:**
- ❌ **Nicht vergessen** zu dokumentieren
- ❌ **Keine emotionalen Notizen** ("Scheiße!", "Fuck!")
  - Besser: objektive Analyse ("Entry zu früh", "SL zu eng")
- ❌ **Nicht nur Gewinner dokumentieren**
  - Verlierer sind wichtiger für dein Lernen!

### 🎯 Pro-Tipps

**1. Konsistenz ist König**
- Trade immer mit demselben Risiko (z.B. 1%)
- Nutze immer denselben Calculator-Workflow
- Dokumentiere immer nach demselben Schema

**2. Das 2%-Maximum**
- Riskiere nie mehr als 2% pro Trade
- Besser: 0,5% - 1% für Anfänger
- Nur erfahrene Trader: bis 2%

**3. Die 6%-Regel**
- Maximal 6% Gesamt-Risiko gleichzeitig
- Beispiel: 3 offene Trades × 2% = 6%
- Mehr offene Trades? Reduziere Risiko pro Trade!

**4. Stop-Loss ist heilig**
- **NIEMALS** den Stop verschieben, um Verluste zu vermeiden
- Wenn der Stop nicht passt, plan den Trade neu
- Lieber keinen Trade als einen ohne vernünftigen Stop

**5. Emotionen ausschalten**
- Nach 2 Verlusten in Folge: PAUSE
- Nach großem Gewinn: PAUSE (Overconfidence!)
- Müde, gestresst, emotional? KEIN TRADING

---

## Fazit

Das Cachy Dashboard ist dein **komplettes Trading-Ökosystem**:

- **Calculator:** Präzises Risikomanagement
- **Journal:** Datengestützte Analyse
- **Workflow:** Vom Plan zur Optimierung

**Der Schlüssel zum Erfolg:**
1. Plane **jeden** Trade im Calculator
2. Halte dich **strikt** an deinen Plan
3. Dokumentiere **alles** im Journal
4. Analysiere **regelmäßig** deine Performance
5. Lerne aus **jedem** Trade

**Trading ist kein Sprint, sondern ein Marathon.**  
Cachy gibt dir die Werkzeuge für langfristigen, nachhaltigen Erfolg.

🚀 **Viel Erfolg beim Trading!**
