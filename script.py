import re

with open('src/services/tradeService.ts', 'r') as f:
    content = f.read()

# Pattern for headers
headers_pattern = r'const headers: Record<string, string> = \{ "Content-Type": "application/json", "X-Provider": provider, \.\.\.\(settingsState\.appAccessToken \? \{ "x-app-access-token": settingsState\.appAccessToken \} : \{\}\) \};'
new_headers = """const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "X-Provider": provider,
            ...(settingsState.appAccessToken ? { "x-app-access-token": settingsState.appAccessToken } : {}),
            "X-Api-Key": keys.key,
            "X-Api-Secret": keys.secret,
            ...(keys.passphrase ? { "X-Api-Passphrase": keys.passphrase } : {})
        };"""

content = content.replace(headers_pattern, new_headers)

# Pattern for fetch body
body_pattern = r'body: JSON\.stringify\(\{ \.\.\.serializedPayload, apiKey: keys\.key, apiSecret: keys\.secret, passphrase: keys\.passphrase \}\)'
new_body = 'body: JSON.stringify(serializedPayload)'

# Use regex for body replacement because of potential whitespace
content = re.sub(r'body: JSON\.stringify\(\{\s*\.\.\.serializedPayload,\s*apiKey: keys\.key,\s*apiSecret: keys\.secret,\s*passphrase: keys\.passphrase\s*\}\)', new_body, content)

with open('src/services/tradeService.ts', 'w') as f:
    f.write(content)
