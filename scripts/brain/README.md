# Cachy Brain - Offline Training Pipeline

Dieser Ordner enthält die Python-Skripte, um FinRL-Agenten zu trainieren und für die Nutzung im Browser (Cachy App) zu exportieren.

## Voraussetzungen

*   Python 3.10 oder höher
*   Empfohlen: Eine virtuelle Umgebung (venv)

## Installation

1.  Terminal öffnen und in diesen Ordner navigieren:
    ```bash
    cd scripts/brain
    ```

2.  Virtuelle Umgebung erstellen (optional, aber empfohlen):
    ```bash
    python -m venv venv
    source venv/bin/activate  # Auf Windows: venv\Scripts\activate
    ```

3.  Abhängigkeiten installieren:
    ```bash
    pip install -r requirements.txt
    ```

    *Hinweis: Die Installation von FinRL und PyTorch kann je nach System einige Minuten dauern.*

## Nutzung

### 1. Training (`train.py`)
Startet das Training eines PPO-Agenten.

```bash
python train.py
```

**Konfiguration (im Skript):**
*   `DATA_SOURCE`: Wähle `"BINANCE"` für exakte Krypto-Daten (kostenlos via Public API) oder `"YAHOO"` für Standard-Daten.
*   Das Skript hat einen automatischen **Fallback**: Wenn Binance nicht erreichbar ist, wird automatisch Yahoo genutzt.

*   Lädt Daten herunter (2023).
*   Trainiert den Agenten für 10.000 Timesteps (Demo).
*   Speichert das Modell als `ppo_cachy_agent.zip`.

### 2. Export (`export.py`)
Wandelt das trainierte PyTorch-Modell in ein universelles ONNX-Format um, das im Browser laufen kann.

```bash
python export.py
```

*   Lädt `ppo_cachy_agent.zip`.
*   Exportiert `cachy_brain.onnx`.
*   Dieses ONNX-Modell kann dann in den `static/models/` Ordner der Cachy App kopiert werden.

## Architektur

*   **Algorithmus:** PPO (Proximal Policy Optimization)
*   **Library:** Stable Baselines 3 (SB3)
*   **Datenquellen:** Binance (via CCXT) oder Yahoo Finance (via FinRL)
*   **Ziel-Format:** ONNX (für WebAssembly Inferenz)
