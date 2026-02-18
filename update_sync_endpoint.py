import re

with open('src/routes/api/sync/positions-pending/+server.ts', 'r') as f:
    content = f.read()

# Import
import_stmt = 'import { extractApiCredentials } from "../../../../../utils/server/requestUtils";\n'
if 'requestUtils' not in content:
    content = import_stmt + content

# Update Schema
content = content.replace('apiKey: z.string().min(1),', 'apiKey: z.string().optional(),')
content = content.replace('apiSecret: z.string().min(1),', 'apiSecret: z.string().optional(),')

# Update Logic
pattern = r'const \{ apiKey, apiSecret \} = result\.data;'
replacement = """const { apiKey: bodyKey, apiSecret: bodySecret } = result.data;
  const creds = extractApiCredentials(request, body);
  const apiKey = creds.apiKey || bodyKey;
  const apiSecret = creds.apiSecret || bodySecret;

  if (!apiKey || !apiSecret) {
      return json({ error: "Missing API Credentials" }, { status: 401 });
  }"""

content = re.sub(pattern, replacement, content)

with open('src/routes/api/sync/positions-pending/+server.ts', 'w') as f:
    f.write(content)
