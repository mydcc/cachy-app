
## Das Trading-Journal: Dein Kompass für konstantes Wachstum

Trading ist kein Glücksspiel – es ist ein Geschäft. Und jedes erfolgreiche Geschäft benötigt eine Buchhaltung. Dein Trading-Journal ist mehr als nur eine Liste von Transaktionen; es ist der Schlüssel, um dein Verhalten zu verstehen, deine Strategie zu optimieren und vom Amateur zum Profi aufzusteigen.

Hier erfährst du, wie du das Journal effektiv nutzt, um deine Performance datengestützt zu analysieren.

### Inhaltsverzeichnis

1.  [Die Philosophie: Plan & Execute](#die-philosophie-plan--execute)
2.  [Journal-Übersicht & Datenmanagement](#journal-übersicht--datenmanagement)
3.  [Performance-Statistiken verstehen](#performance-statistiken-verstehen)
4.  [Deep Dive: Analysen für Profis](#deep-dive-analysen-für-profis)
5.  [Formeln & Berechnungen](#formeln--berechnungen)

---

### Die Philosophie: Plan & Execute

Erfolgreiches Trading basiert auf einem wiederholbaren Prozess. Der **Calculator** und das **Journal** arbeiten Hand in Hand:

1.  **Planen (Calculator):** Du definierst VOR dem Trade dein Risiko. Wo ist der Entry? Wo ist der Stop-Loss? Wie viel % deines Kapitals riskierst du?
    *   *Der Calculator stellt sicher, dass du nie blind in einen Trade gehst.*
2.  **Ausführen (Broker):** Du setzt den Trade basierend auf den berechneten Werten um.
3.  **Dokumentieren (Journal):** Sobald der Trade beendet ist (automatisch via API oder manuell), landet er im Journal.
    *   *Hier beginnt die eigentliche Arbeit: Die Analyse.*
4.  **Optimieren:** Du nutzt die "Deep Dive"-Charts, um Muster zu erkennen. Verlierst du oft am Freitag? Sind deine Longs profitabler als Shorts?

---

### Journal-Übersicht & Datenmanagement

Die Haupttabelle gibt dir sofortigen Zugriff auf die Historie deiner Entscheidungen.

*   **Filter & Suche:** Nutze die Suchleiste für Symbole oder Tags (z.B. "Breakout"). Filter nach Status (Won/Lost/Open) oder Datum, um Perioden isoliert zu betrachten.
*   **Tags & Notizen:** Das wichtigste Werkzeug für die qualitative Analyse.
    *   Nutze Tags für Strategien: `SFP`, `Trendline`, `News`.
    *   Nutze Tags für Fehler: `FOMO`, `Revenge`, `FatFinger`.
    *   Später kannst du im **Deep Dive -> Strategies** genau sehen, welche Strategie Geld druckt und welche Geld verbrennt.
*   **Screenshots:** Ein Bild sagt mehr als 1000 Zahlen. Lade Charts hoch, um Setup und Ausführung visuell zu speichern.
*   **Pivot-Modus (Pro):** Gruppiere Trades nach Symbolen. Das zeigt dir sofort, mit welchen Assets du harmonierst und welche du meiden solltest.

**Datenquellen:**
*   **Sync (Bitunix):** Holt automatisch deine Historie. PnL, Gebühren und Funding werden exakt übernommen.
*   **CSV Import/Export:** Deine Daten gehören dir. Nutze den Export für externe Backups oder Excel-Analysen.

---

### Performance-Statistiken verstehen

Im oberen Dashboard (Performance Preset) siehst du die Gesundheit deines Accounts auf einen Blick.

*   **Equity Curve:** Zeigt den Verlauf deines Kapitals. Eine glatte Kurve von links unten nach rechts oben ist das Ziel. Starke Zacken deuten auf inkonsistentes Risikomanagement hin.
*   **Drawdown:** Der Schmerz-Indikator. Wie weit bist du vom Höchststand (All-Time-High) entfernt?
    *   *Tipp:* Ein hoher Drawdown erfordert exponentiell höhere Gewinne, um ihn auszugleichen (50% Verlust benötigen 100% Gewinn). Halte Drawdowns klein!
*   **Monthly PnL:** Deine Konsistenz über Monate hinweg.

---

### Deep Dive: Analysen für Profis

Hier trennt sich die Spreu vom Weizen. Wähle im Dropdown verschiedene Perspektiven:

#### 1. Timing
Wann bist du am besten?
*   **Hourly PnL:** Zeigt deine Performance pro Tagesstunde.
    *   *Action:* Wenn du zwischen 12:00 und 14:00 Uhr Geld verlierst (Mittagspause/geringe Vola), trade nicht in dieser Zeit!
*   **Duration vs PnL:** Hältst du Gewinner lange und schließt Verlierer schnell?
    *   *Ziel:* Grüne Punkte sollten tendenziell weiter rechts (längere Dauer) und höher sein als rote Punkte.

#### 2. Assets & Market
Was und wie tradest du?
*   **Asset Bubble:** Eine Matrix aus Winrate (X-Achse) und PnL (Y-Achse).
    *   *Top Rechts:* Deine besten Coins. Erhöhe hier die Position Size.
    *   *Unten Links:* Deine "Account-Killer". Streiche diese Coins von der Watchlist.
*   **Long vs. Short:** Bist du ein Bär oder ein Bulle? Viele Trader haben einen Bias. Die Zahlen lügen nicht.

#### 3. Risk & Quality
Stimmt dein Risikomanagement?
*   **R-Multiple Distribution:** Wie oft triffst du 1R, 2R oder 3R?
    *   *Profi-Tipp:* Du brauchst keine 90% Winrate. Wenn du oft 3R gewinnst, reicht eine Winrate von 30%, um profitabel zu sein.
*   **Risk vs. Realized PnL:** Korreliert dein Risiko mit dem Ergebnis? Hohes Risiko sollte hohen Gewinn bedeuten. Wenn du bei hohem Risiko oft verlierst, reduziere die Size.

#### 4. Psychology
Bist du diszipliniert?
*   **Streaks:** Wie lang sind deine Gewinn- und Verlustserien?
    *   *Achtung:* Nach einer langen Gewinnserie neigen wir zu Übermut (Overconfidence). Nach einer Verlustserie zu Rache-Trading (Tilt). Kenne deine Statistik, um emotional stabil zu bleiben.

#### 5. Strategies (Tags)
Welches Setup funktioniert?
*   Hier siehst du die PnL-Kurve für jeden Tag, den du vergeben hast.
*   *Analyse:* Wenn "Breakout" profitabel ist, aber "Reversal" nur Verluste bringt -> Fokus auf Breakouts!

---

### Formeln & Berechnungen

Wir nutzen präzise Mathematik für deine KPIs.

**1. Profit Factor**
Das Verhältnis von Bruttogewinn zu Bruttoverlust. Ein Wert über 1.0 bedeutet Profitabilität.
$$ \text{Profit Factor} = \frac{\sum \text{Gross Profit}}{\sum |\text{Gross Loss}|} $$
*   $> 1.5$: Solides System
*   $> 2.0$: Exzellentes System

**2. Expectancy (Erwartungswert)**
Wie viel Dollar verdienst du durchschnittlich pro Trade?
$$ E = (\text{Win Rate} \times \text{Avg Win}) - (\text{Loss Rate} \times \text{Avg Loss}) $$

**3. R-Multiple**
Das Ergebnis eines Trades im Verhältnis zum initialen Risiko. Dies macht Trades mit unterschiedlichen Kontogrößen vergleichbar.
$$ R = \frac{\text{Realized PnL}}{\text{Initial Risk Amount}} $$

**4. Average RR (Risk/Reward)**
Das durchschnittlich realisierte Chance-Risiko-Verhältnis.
$$ \text{Avg RR} = \frac{\text{Avg Win}}{\text{Avg Loss}} $$

---
*Erfolg im Trading ist kein Sprint, sondern ein Marathon. Dein Journal ist dein Trainingsplan.*
