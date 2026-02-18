import re

with open('src/routes/api/tpsl/+server.ts', 'r') as f:
    content = f.read()

# Import
import_stmt = 'import { extractApiCredentials } from "../../../utils/server/requestUtils";\n'
if 'requestUtils' not in content:
    content = import_stmt + content

# Logic
pattern = r'const \{ exchange, apiKey, apiSecret, action, params = \{\} \} = validation\.data;'
replacement = """const { exchange, action, params = {} } = validation.data;
    const creds = extractApiCredentials(request, body);
    const apiKey = creds.apiKey || validation.data.apiKey;
    const apiSecret = creds.apiSecret || validation.data.apiSecret;

    if (!apiKey || !apiSecret) {
         return json({ error: "Missing API Credentials" }, { status: 401 });
    }"""

content = re.sub(pattern, replacement, content)

with open('src/routes/api/tpsl/+server.ts', 'w') as f:
    f.write(content)
