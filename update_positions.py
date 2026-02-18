import re

with open('src/routes/api/positions/+server.ts', 'r') as f:
    content = f.read()

# Add import
import_stmt = 'import { extractApiCredentials } from "../../../utils/server/requestUtils";\n'
if 'requestUtils' not in content:
    content = import_stmt + content

# Logic
pattern = r'const \{ exchange, apiKey, apiSecret, passphrase \} = validation\.data;'
replacement = """const { exchange } = validation.data;
  const creds = extractApiCredentials(request, body);
  const apiKey = creds.apiKey || validation.data.apiKey;
  const apiSecret = creds.apiSecret || validation.data.apiSecret;
  const passphrase = creds.passphrase || validation.data.passphrase;

  if (!apiKey || !apiSecret) {
      return jsonError("Missing API Credentials", "MISSING_CREDENTIALS", 401);
  }"""

content = re.sub(pattern, replacement, content)

with open('src/routes/api/positions/+server.ts', 'w') as f:
    f.write(content)
