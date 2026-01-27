# FinRL Integrations-Plan: "Cachy Brain" (Client-Side Edition)

Dieser Plan beschreibt die Integration von FinRL-Modellen direkt in den Browser des Nutzers.
Ziel: **0% Server-Last**, maximale Skalierbarkeit und Datenschutz.

## Architektur-Zielbild

```mermaid
graph TD
    User[Trader] --> UI[Cachy Frontend (SvelteKit)]

    subgraph "Training (Offline / Dev-Machine)"
        Py[Python Scripts] --> FinRL[FinRL Training (PPO)]
        FinRL -- "Export" --> ONNX[model.onnx]
    end

    subgraph "Inference (User Browser)"
        UI -- "1. Load Model" --> Static[Static Asset (/models/brain.onnx)]
        UI -- "2. WebGPU/WASM" --> ORT[ONNX Runtime Web]
        ORT -- "3. Prediction" --> UI
    end
```

---

## Phase 1: Offline Training Pipeline (Python)

Das Training findet **nicht** auf dem Produktions-Server statt, sondern lokal (oder in einer Cloud-Training-Pipeline).

### 1.1 Trainings-Skripte (`/scripts/brain/`)
Wir erstellen Python-Skripte für den Entwicklungsprozess:
*   `train.py`: Lädt historische Daten, trainiert einen PPO-Agenten mit Stable-Baselines3.
*   `export.py`: Konvertiert das trainierte PyTorch-Modell in das **ONNX-Format**.
*   `verify.py`: Prüft, ob das ONNX-Modell die gleichen Ergebnisse liefert wie das PyTorch-Modell.

### 1.2 Modell-Ablage
Das exportierte Modell (`brain_v1.onnx`) wird in den Ordner `static/models/` kopiert. Damit ist es für den Browser unter `https://cachy.app/models/brain_v1.onnx` erreichbar.

---

## Phase 2: Client-Side Inference (TypeScript)

Der Browser übernimmt die Rechenarbeit.

### 2.1 Dependencies
Installation von Microsofts ONNX Runtime für Web:
`npm install onnxruntime-web`

### 2.2 BrainService (Client)
Ein neuer Service in `src/services/brainService.ts`:
*   **Initialization:** Lädt die `.onnx` Datei und initialisiert die WebAssembly/WebGPU Session.
*   **Featurization:** Wandelt den aktuellen `marketState` (Preise, RSI, MACD) in einen `Float32Array` Tensor um.
*   **Prediction:** Führt `session.run()` aus und erhält die Wahrscheinlichkeiten (z.B. `[0.1, 0.8, 0.1]` für Short/Hold/Long).

---

## Phase 3: Daten-Schnittstelle (State Definition)

Damit das Modell funktioniert, muss der Input exakt stimmen.

### 3.1 Input Tensor (Der "Blick" des Agenten)
Wir definieren einen festen Vektor (Array) mit z.B. 12 Werten:
1.  RSI (14) / 100
2.  MACD / Preis
3.  Abstand zu EMA 200 (%)
4.  Log-Return (1h)
5.  Log-Return (4h)
6.  Volatilität (ATR / Preis)
7.  ... (weitere Indikatoren)

**Wichtig:** Diese Werte müssen in TypeScript (Browser) exakt so berechnet werden wie in Python (Training).

---

## Phase 4: UI Integration

### 4.1 "AI Compass" Widget
*   Eine futuristische Anzeige im Dashboard.
*   Zeigt die "Meinung" der KI in Echtzeit an.
*   Status: "Loading Model...", "Computing...", "Bullish (85%)".

### 4.2 WebWorker (Optional)
Falls das Modell komplexer wird, lagern wir die Berechnung in einen WebWorker aus, damit das UI nicht einfriert (obwohl ONNX Web sehr schnell ist).

---

## Zeitplan & Vorteile

*   **Server-Last:** Null. Der Server liefert nur eine statische Datei aus.
*   **Latenz:** Extrem niedrig (kein Netzwerk-Roundtrip für die Vorhersage).
*   **Kosten:** Keine GPU-Server nötig.
*   **Datenschutz:** Marktdaten und Portfolio verlassen nie den Browser des Users.

### Nächste Schritte
1.  `onnxruntime-web` installieren.
2.  `src/services/brainService.ts` erstellen (Gerüst).
3.  Ein Dummy-Modell (ONNX) erstellen und testen.
