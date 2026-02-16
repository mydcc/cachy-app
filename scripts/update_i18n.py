import json
import os

path = 'src/locales/locales/en.json'

with open(path, 'r') as f:
    data = json.load(f)

# Update common
if 'common' not in data:
    data['common'] = {}
data['common']['close'] = "Close"
data['common']['analyzing'] = "Analyzing..."

# Update dashboard
if 'dashboard' not in data:
    data['dashboard'] = {}
data['dashboard']['triggerPulse'] = "Trigger Quantum Pulse"
data['dashboard']['favorites'] = "Favorites" # Ensure it exists

# Write back
with open(path, 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n') # Add newline
