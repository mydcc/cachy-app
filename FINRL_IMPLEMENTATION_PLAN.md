# FinRL Integrations-Plan: "Cachy Brain"

Dieser Plan beschreibt die schrittweise Integration einer Python-basierten FinRL-Umgebung in die bestehende Cachy SvelteKit-Applikation via Microservice-Architektur.

## Architektur-Zielbild

```mermaid
graph TD
    User[Trader] --> UI[Cachy Frontend (SvelteKit)]
    UI --> Node[Cachy Backend (Node.js)]

    subgraph "Cachy Brain (Python/Docker)"
        API[FastAPI Server]
        Agent[FinRL Agent (PPO/DQN)]
        Env[Gym Trading Environment]
    end

    Node -- "1. Marktdaten & Portfolio (State)" --> API
    API -- "2. Handlungsempfehlung (Action)" --> Node
    API -- "3. Training Trigger" --> Env
```

---

## Phase 1: Die Infrastruktur (Python Microservice)

Da FinRL zwingend Python benötigt, kapseln wir die Logik in einem dedizierten Service.

### 1.1 Docker Setup
Erstellung eines `Dockerfile.brain` im Root:
*   **Base Image:** `python:3.10-slim`
*   **Dependencies:** `finrl`, `gymnasium`, `fastapi`, `uvicorn`, `pandas`, `numpy`, `torch`.
*   **GPU Support:** Optional (für späteres Training auf Servern mit CUDA).

### 1.2 API-Gerüst (FastAPI)
Ein schlanker Server (`server/brain/main.py`), der folgende Endpunkte bereitstellt:
*   `GET /health`: Status-Check.
*   `POST /predict`: Nimmt einen Markt-State (JSON) entgegen und liefert eine Action.
*   `POST /train`: Startet einen asynchronen Trainings-Job auf historischen Daten.

---

## Phase 2: Datenschnittstelle (Node.js Bridge)

Cachy muss lernen, die Sprache des Modells zu sprechen.

### 2.1 State-Definition
Wir definieren, was der Agent "sieht". Ein standardisierter JSON-Payload:
```json
{
  "symbol": "BTCUSDT",
  "timeframe": "1h",
  "market_data": {
    "close": 65000.50,
    "rsi_14": 55.4,
    "macd": 120.5,
    "volume_norm": 0.8
  },
  "portfolio_data": {
    "balance_usdt": 1000.0,
    "current_position_size": 0.1,
    "unrealized_pnl_pct": 2.5
  }
}
```

### 2.2 BrainService (TypeScript)
Ein neuer Service in `src/services/brainService.ts`:
*   `getPrediction(symbol, timeframe)`: Sammelt Daten aus `marketState` und `accountState`, ruft den Python-Service auf.
*   `trainModel(symbol, days)`: Lädt historische Klines via `apiService`, formatiert sie als CSV/JSON und sendet sie an den Python-Service zum Training.

---

## Phase 3: Das Erste Modell (Trend-Scout)

Wir beginnen NICHT mit einem vollautomatischen Trader, sondern mit einem **Signal-Geber**.

### 3.1 Ziel
Ein Agent, der die Wahrscheinlichkeit für einen **Trend-Wechsel** vorhersagt.

### 3.2 Training
*   **Algorithmus:** PPO (Proximal Policy Optimization) - stabil und effizient.
*   **Environment:** Eine vereinfachte Trading-Umgebung, die nur Long/Short/Flat kennt.
*   **Reward Function:** Maximierung des Sharpe-Ratio (Risiko-adjustierter Gewinn). Bestrafung für hohe Volatilität im PnL.

---

## Phase 4: UI Integration

Die "Intelligenz" muss für den User sichtbar werden.

### 4.1 Dashboard Widget "AI Sentiment"
Erweiterung des Dashboards um eine Kachel:
*   Zeigt aktuellen "Brain State": 🟢 Bullish (80%), 🔴 Bearish (60%), ⚪ Neutral.
*   Zeigt Vertrauens-Score (Confidence).

### 4.2 Journal Integration
*   Bei jedem Trade im Journal wird gespeichert: "Was hat die KI zu diesem Zeitpunkt gesagt?"
*   Dies ermöglicht später eine Auswertung: "Hätte ich auf die KI gehört, hätte ich X% mehr Gewinn gemacht".

---

## Zeitplan (Schätzung)

1.  **Infrastruktur & Hello World:** 1 Tag (Docker, FastAPI läuft).
2.  **Data Bridge:** 1 Tag (Cachy sendet korrekte Daten).
3.  **Erstes Training:** 2-3 Tage (Experimentieren mit Hyperparametern, bis das Modell "lernt").
4.  **UI & Integration:** 1 Tag.

**Gesamt:** Ca. 1 Woche für einen funktionierenden Prototypen.
