import re

with open('src/services/bitunixWs.ts', 'r') as f:
    content = f.read()

# Public
public_pattern = r'private connectPublic\(force = false\) \{(\s*)if \(this\.isDestroyed \|\| !settingsState\.capabilities\.marketData\) return;'
public_replacement = r'private connectPublic(force = false) {\1if (this.isDestroyed || !settingsState.capabilities.marketData) return;\1\1// HARDENING: Enforce WSS\1if (!WS_PUBLIC_URL.startsWith("wss://")) {\1    logger.error("network", "[BitunixWS] Insecure WebSocket URL detected (Public). Aborting connection.");\1    return;\1}'

content = re.sub(public_pattern, public_replacement, content)

# Private
private_pattern = r'private connectPrivate\(force = false\) \{(\s*)if \(this\.isDestroyed\) return;'
private_replacement = r'private connectPrivate(force = false) {\1if (this.isDestroyed) return;\1\1// HARDENING: Enforce WSS\1if (!WS_PRIVATE_URL.startsWith("wss://")) {\1    logger.error("network", "[BitunixWS] Insecure WebSocket URL detected (Private). Aborting connection.");\1    return;\1}'

content = re.sub(private_pattern, private_replacement, content)

with open('src/services/bitunixWs.ts', 'w') as f:
    f.write(content)
