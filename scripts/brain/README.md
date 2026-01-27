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
Startet das Training eines PPO-Agenten auf historischen Daten (standardmäßig Apple-Aktien als Beispiel, kann auf Krypto angepasst werden).

```bash
python train.py
```

*   Lädt Daten herunter.
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
*   **Environment:** Gymnasium / FinRL StockTradingEnv
*   **Ziel-Format:** ONNX (für WebAssembly Inferenz)
