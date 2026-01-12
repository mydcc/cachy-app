# Anleitung: Meistere dein Trading mit Cachy

Cachy ist eine Webanwendung für Krypto-Händler, die entwickelt wurde, um Positionsgrößen zu berechnen, Risiken zu verwalten und ein Handelsjournal zu führen.
Diese Anleitung erklärt dir dieses Tools Schritt für Schritt, um dein Trading auf das nächste Level zu heben.

Der Kern des erfolgreichen Tradings ist **diszipliniertes Risikomanagement**. Cachy hilft dir dabei, die komplexen, aber entscheidenden Berechnungen für dich zu automatisieren.

---

### Inhaltsverzeichnis
1.  [Der Standard-Workflow: Die Positionsgröße berechnen](#standard-workflow)
2.  [Alternative Workflows: Die Sperr-Funktionen](#sperr-funktionen)
3.  [Stop-Loss für Profis: Der ATR-Modus](#atr-modus)
4.  [Das Chance-Risiko-Verhältnis (CRV) verstehen](#crv-verstehen)
5.  [Fazit](#fazit)

---

### <a name="standard-workflow"></a>1. Der Standard-Workflow: Die Positionsgröße berechnen

Dies ist der häufigste Anwendungsfall. Du gibst vor, wie viel Prozent deines Kapitals du riskieren möchtest, und Cachy berechnet die **exakte Positionsgröße**, die du handeln musst.

**Beispiel-Szenario:**

*   **Dein Kapital:** 10.000 €
*   **Dein Risiko pro Trade:** 1 % (also 100 €)
*   **Asset:** BTC/USDT
*   **Geplanter Einstieg:** 50.000 €
*   **Geplanter Stop-Loss:** 49.500 €

**So funktioniert die Berechnung:**

**Schritt 1: Risikobetrag in €**
Zuerst wird dein prozentuales Risiko in einen konkreten Geldbetrag umgerechnet.
```
Kapital * (Risiko % / 100)
// Beispiel: 10.000 € * (1 / 100) = 100 €
```

**Schritt 2: Risiko pro Anteil (Unit)**
Als Nächstes berechnet die App, wie viel du pro gekaufter Einheit (z.B. pro "Stück" BTC) verlieren würdest, wenn dein Stop-Loss ausgelöst wird.
```
|Einstiegspreis - Stop-Loss-Preis|
// Beispiel: |50.000 € - 49.500 €| = 500 €
```

**Schritt 3: Die Positionsgröße**
Jetzt wird dein gesamtes Risiko durch das Risiko pro Anteil geteilt. Das Ergebnis ist die exakte Menge an Anteilen (hier: BTC), die du kaufen musst.
```
Risikobetrag / Risiko pro Anteil
// Beispiel: 100 € / 500 € = 0,2
```

**Ergebnis:** Du musst genau **0,2 BTC** kaufen, um exakt 100 € zu riskieren.

**Der Nutzen für dich:** Kein Raten mehr. Kein "ungefähr". Du weißt auf den Cent genau, dass du dein Risikolimit einhältst, egal wie volatil der Markt ist.

---

### <a name="sperr-funktionen"></a>2. Alternative Workflows: Die Sperr-Funktionen

Manchmal möchtest du die Berechnung andersherum durchführen. Dafür gibt es die **Sperr-Buttons** (🔒) neben dem Risikobetrag und der Positionsgröße.

#### Szenario A: Risikobetrag sperren

*   **Wann nutzen?** Wenn du in **festen Geldbeträgen** denkst ("Ich riskiere heute 50 €") anstatt in Prozent.

*   **Wie es funktioniert:**
    1.  Gib deinen gewünschten Risikobetrag (z.B. 50 €) in das Feld "Risk Amount" ein und klicke auf das Schloss-Symbol.
    2.  Die App passt nun automatisch das Feld "Risiko pro Trade (%)" für dich an.
    3.  Alle anderen Berechnungen laufen wie gewohnt ab.

*   **Dein Vorteil:** Flexibilität für Trader, die ihr Risiko lieber in ihrer Währung als in Prozent planen.

#### Szenario B: Positionsgröße sperren

*   **Wann nutzen?** Wenn du eine **feste Positionsgröße** handeln möchtest (z.B. immer 1 ganze Aktie, immer 0.5 ETH).

*   **Wie es funktioniert:**
    1.  Sperre das Feld "Position Size" und gib deine gewünschte Größe ein.
    2.  Passe nun deinen Einstieg und Stop-Loss an.
    3.  Die App berechnet jetzt **rückwärts**, wie hoch dein Risiko (in % und €) bei dieser Positionsgröße und diesem Stop-Loss ist.

*   **Dein Vorteil:** Perfekt für Strategien, die auf festen Handelsgrößen basieren. Du siehst sofort die Risiko-Konsequenzen deiner Planung.

---

### <a name="atr-modus"></a>3. Stop-Loss für Profis: Der ATR-Modus

Einen Stop-Loss zu setzen ist eine Kunst. Der **ATR (Average True Range)** Modus hilft dir dabei, indem er die aktuelle Marktvolatilität berücksichtigt.

**Was ist der ATR?**
Der ATR misst die **durchschnittliche Preisschwankung** über einen bestimmten Zeitraum (z.B. die letzten 14 Tage). Ein hoher ATR bedeutet hohe Volatilität, ein niedriger ATR bedeutet geringe Volatilität.

**Wie Cachy den ATR berechnet:**
Cachy holt sich die Kerzendaten (Hoch, Tief, Schlusskurs) der letzten 15 Perioden für das gewählte Zeitfenster (z.B. 1D für 15 Tage). Für jede der letzten 14 Perioden wird die **"True Range"** berechnet, was der größte der folgenden drei Werte ist:
1.  `Aktuelles Hoch - Aktuelles Tief`
2.  `|Aktuelles Hoch - Vorheriger Schlusskurs|`
3.  `|Aktuelles Tief - Vorheriger Schlusskurs|`

Der ATR ist dann der **Durchschnitt** dieser 14 "True Range"-Werte.

**So nutzt du den ATR Stop-Loss:**
1.  Aktiviere den Schalter **"ATR Stop-Loss"**.
2.  Wähle den Modus:
    *   **Auto:** Cachy holt den aktuellen ATR-Wert für das gewählte Symbol und Zeitfenster automatisch von der Börse.
    *   **Manual:** Du gibst einen eigenen ATR-Wert ein.
3.  Gib einen **Multiplikator** ein. Ein üblicher Wert ist 2.
4.  Der Stop-Loss wird nun automatisch berechnet:
    ```
    // Long-Trade:
    Stop-Loss = Einstiegspreis - (ATR-Wert * Multiplikator)

    // Short-Trade:
    Stop-Loss = Einstiegspreis + (ATR-Wert * Multiplikator)
    ```

**Dein Vorteil:** Dein Stop-Loss ist nicht willkürlich, sondern passt sich intelligent der aktuellen Marktlage an. Bei hoher Volatilität gibt er dem Trade mehr Raum zum Atmen, bei niedriger Volatilität sitzt er enger am Preis.

---

### <a name="crv-verstehen"></a>4. Das Chance-Risiko-Verhältnis (CRV / R-R) verstehen

Das CRV ist eine der wichtigsten Kennzahlen im Trading. Es sagt dir, wie viel Gewinn du im Verhältnis zu deinem Risiko erwarten kannst.

Ein **CRV von 1:1** bedeutet: Du riskierst 100 €, um 100 € zu gewinnen.
Ein **CRV von 3:1** bedeutet: Du riskierst 100 €, um 300 € zu gewinnen.

**Wie Cachy das CRV anzeigt:**

*   **Individuelles CRV:** Für jedes Take-Profit (TP) Ziel siehst du ein eigenes CRV. So kannst du die Attraktivität jedes einzelnen Ziels bewerten.
*   **Gewichtetes CRV (Weighted R/R):** Dies ist das durchschnittliche CRV für deinen gesamten Trade, unter Berücksichtigung der prozentualen Anteile, die du an den jeweiligen Zielen verkaufst.

**Dein Vorteil:** Cachy zwingt dich quasi dazu, über dein CRV nachzudenken. Trades mit einem CRV unter 1:1 sind oft langfristig nicht profitabel. Mit diesem Tool kannst du sicherstellen, dass deine potenziellen Gewinne deine Verluste systematisch übersteigen.

---

### <a name="fazit"></a>5. Fazit

Cachy ist dein Partner für diszipliniertes, datengestütztes Trading. Es nimmt dir die fehleranfälligen Berechnungen ab und ermöglicht es dir, dich auf das zu konzentrieren, was zählt: **deine Strategie und das Finden guter Trading-Setups.**
