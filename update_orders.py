import re

with open('src/routes/api/orders/+server.ts', 'r') as f:
    content = f.read()

# Add import
import_stmt = 'import { extractApiCredentials } from "../../../utils/server/requestUtils";\n'
if 'requestUtils' not in content:
    content = import_stmt + content

# Replace logic inside POST
# Find the Zod validation block and subsequent destructuring
# Old: const { exchange, apiKey, apiSecret, passphrase } = payload;
# New: logic to extract and merge

pattern = r'const \{ exchange, apiKey, apiSecret, passphrase \} = payload;'
replacement = """const { exchange } = payload;
  const creds = extractApiCredentials(request, body);
  const apiKey = creds.apiKey || payload.apiKey;
  const apiSecret = creds.apiSecret || payload.apiSecret;
  const passphrase = creds.passphrase || payload.passphrase;

  if (!apiKey || !apiSecret) {
      return json({ error: "Missing API Credentials" }, { status: 401 });
  }"""

content = re.sub(pattern, replacement, content)

with open('src/routes/api/orders/+server.ts', 'w') as f:
    f.write(content)
