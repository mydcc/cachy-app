import re

with open('src/services/tradeService.ts', 'r') as f:
    content = f.read()

old_block = r'headers: \{ "Content-Type": "application/json", \.\.\.\(settingsState\.appAccessToken \? \{ "x-app-access-token": settingsState\.appAccessToken \} : \{\}\) \},\s*body: JSON\.stringify\(\{\s*apiKey: settingsState\.apiKeys\.bitunix\.key,\s*apiSecret: settingsState\.apiKeys\.bitunix\.secret,\s*\}\),'

new_block = """headers: {
                    "Content-Type": "application/json",
                    ...(settingsState.appAccessToken ? { "x-app-access-token": settingsState.appAccessToken } : {}),
                    "X-Api-Key": settingsState.apiKeys.bitunix.key,
                    "X-Api-Secret": settingsState.apiKeys.bitunix.secret
                },
                body: JSON.stringify({}),"""

content = re.sub(old_block, new_block, content)

with open('src/services/tradeService.ts', 'w') as f:
    f.write(content)
