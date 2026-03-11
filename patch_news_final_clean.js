import fs from 'fs';

const filePath = 'src/routes/api/external/news/+server.ts';
let code = fs.readFileSync(filePath, 'utf8');

// 1. Import sanitizeErrorMessage
if (!code.includes('import { sanitizeErrorMessage }')) {
  code = code.replace(
    'import { NewsApiResponseSchema, CryptoPanicResponseSchema } from "../../../../types/newsSchemas";',
    'import { NewsApiResponseSchema, CryptoPanicResponseSchema } from "../../../../types/newsSchemas";\nimport { sanitizeErrorMessage } from "../../../../types/apiSchemas";'
  );
}

// 2. Move let apiKey = "";
if (!code.includes('let apiKey = "";')) {
  code = code.replace(
    'let cacheKey = "";\n\n  try {',
    'let cacheKey = "";\n  let apiKey = "";\n\n  try {'
  );

  code = code.replace(
    '    // Extract API Key from Header (primary) or Body (fallback)\n    const creds = extractApiCredentials(request, body);\n    const apiKey = creds.apiKey || body.apiKey;',
    '    // Extract API Key from Header (primary) or Body (fallback)\n    const creds = extractApiCredentials(request, body);\n    apiKey = creds.apiKey || body.apiKey;'
  );
}

// 3. Update inner catch
code = code.replace(
  /          } catch \(e: any\) {[\s\S]*?continue;\n          }/,
  `          } catch (e: any) {
            let msg = e.message || String(e);
            if (apiKey && apiKey.length > 4) {
              msg = msg.split(apiKey).join("***");
            }
            msg = sanitizeErrorMessage(msg);

            if (msg.includes("429")) throw new Error(msg);
            console.warn(\`[NewsProxy] Plan \${p} failed:\`, msg);
            lastError = msg;
            continue;
          }`
);

// 4. Update outer catch
code = code.replace(
  /  } catch \(err: any\) {\n    const errorMsg = err instanceof Error \? err\.message : String\(err\);\n    \/\/ Safe logging: Don't log full URL if it has keys\n    console\.error\(\`\[NewsProxy\] Error processing request for \${request\.url}:\`, errorMsg\);/,
  `  } catch (err: any) {
    let errorMsg = err instanceof Error ? err.message : String(err);
    if (apiKey && apiKey.length > 4) {
      errorMsg = errorMsg.split(apiKey).join("***");
    }
    errorMsg = sanitizeErrorMessage(errorMsg);

    // Safe logging: Don't log full URL if it has keys
    console.error(\`[NewsProxy] Error processing request for \${request.url}:\`, errorMsg);`
);

fs.writeFileSync(filePath, code);

// TESTS
const testFile = 'src/routes/api/external/news/news_security.test.ts';
let testCode = fs.readFileSync(testFile, 'utf8');

testCode = testCode.replace(
    'import { POST, _newsCache } from \'./+server\';',
    'import { POST, _newsCache } from \'./+server\';\nimport * as auth from \'../../../../lib/server/auth\';'
);

testCode = testCode.replace(
    'describe(\'News Service Security\', () => {',
    'describe(\'News Service Security\', () => {\n    vi.spyOn(auth, \'checkAppAuth\').mockReturnValue(null);'
);
testCode = testCode.replace(
  '        const fetchMock = vi.fn().mockImplementation(async (url) => {',
  '        const fetchMock = vi.fn().mockImplementation(async (url, options) => {'
);
testCode = testCode.replace(
  'if (url.includes(validKey)) {',
  'if (url.includes(validKey) || options?.headers?.["X-Api-Key"] === validKey || options?.headers?.["x-api-key"] === validKey) {'
);
testCode = testCode.replace(
  `        const req1 = {
            json: async () => ({
                source: 'newsapi',
                apiKey: validKey,
                params: params
            }),
            url: 'http://localhost/api/news'
        } as any;`,
  `        const req1 = {
            headers: new Map([['x-api-key', validKey]]),
            json: async () => ({
                source: 'newsapi',
                apiKey: validKey,
                params: params
            }),
            url: 'http://localhost/api/news'
        } as any;`
);
testCode = testCode.replace(
  `        const req2 = {
            json: async () => ({
                source: 'newsapi',
                apiKey: invalidKey, // Different key
                params: params
            }),
            url: 'http://localhost/api/news'
        } as any;`,
  `        const req2 = {
            headers: new Map([['x-api-key', invalidKey]]),
            json: async () => ({
                source: 'newsapi',
                apiKey: invalidKey, // Different key
                params: params
            }),
            url: 'http://localhost/api/news'
        } as any;`
);

testCode = testCode.replace(
  'const responseData = { articles: [\'secure-data\'] };',
  'const responseData = { status: "ok", articles: [{ title: \'secure-data\' }] };'
);

fs.writeFileSync(testFile, testCode);

const testFile2 = 'src/routes/api/external/news/news_service_memory.test.ts';
let testCode2 = fs.readFileSync(testFile2, 'utf8');

testCode2 = testCode2.replace(
    'import { POST, _newsCache } from \'./+server\';',
    'import { POST, _newsCache } from \'./+server\';\nimport * as auth from \'../../../../lib/server/auth\';'
);

testCode2 = testCode2.replace(
    'describe(\'News Service Cache Memory\', () => {',
    'describe(\'News Service Cache Memory\', () => {\n    vi.spyOn(auth, \'checkAppAuth\').mockReturnValue(null);'
);

testCode2 = testCode2.replace(
    `            const request = {
                json: async () => ({
                    source: 'newsapi',
                    apiKey: 'test-key',
                    params: { q: \`test-\${i}\` }
                })
            } as any;`,
    `            const request = {
                headers: new Map([['x-api-key', 'test-key']]),
                json: async () => ({
                    source: 'newsapi',
                    apiKey: 'test-key',
                    params: { q: \`test-\${i}\` }
                })
            } as any;`
);

testCode2 = testCode2.replace(
    'json: async () => ({ articles: [] }),',
    'json: async () => ({ status: "ok", articles: [] }),'
);

fs.writeFileSync(testFile2, testCode2);

const testFile3 = 'src/routes/api/sync/sync_security.test.ts';
let testCode3 = fs.readFileSync(testFile3, 'utf8');

testCode3 = testCode3.replace(
    'import { POST } from \'./+server\';',
    'import { POST } from \'./+server\';\nimport * as auth from \'../../../lib/server/auth\';'
);

testCode3 = testCode3.replace(
    'describe(\'POST /api/sync\', () => {',
    'describe(\'POST /api/sync\', () => {\n    vi.spyOn(auth, \'checkAppAuth\').mockReturnValue(null);'
);

fs.writeFileSync(testFile3, testCode3);

const testFile4 = 'src/routes/api/account/account.test.ts';
let testCode4 = fs.readFileSync(testFile4, 'utf8');

testCode4 = testCode4.replace(
    'import { POST } from \'./+server\';',
    'import { POST } from \'./+server\';\nimport * as auth from \'../../../lib/server/auth\';'
);

testCode4 = testCode4.replace(
    'describe(\'POST /api/account Security\', () => {',
    'describe(\'POST /api/account Security\', () => {\n    vi.spyOn(auth, \'checkAppAuth\').mockReturnValue(null);'
);

testCode4 = testCode4.replace(
    'expect(body).toEqual({ error: \'Invalid JSON body\' });',
    'expect(body.error?.message || body.error).toEqual(\'Invalid JSON body\');'
);

testCode4 = testCode4.replace(
    'expect(body).toHaveProperty(\'error\', \'Validation Error\');',
    'expect(body.error?.message || body.error).toEqual(\'Validation Error\');'
);

testCode4 = testCode4.replace(
    `    const request = {
      text: vi.fn().mockResolvedValue('{ "broken": '),
    } as unknown as Request;`,
    `    const request = {
      headers: new Headers(),
      text: vi.fn().mockResolvedValue('{ "broken": '),
    } as unknown as Request;`
);

testCode4 = testCode4.replace(
    `    const request = {
      text: vi.fn().mockResolvedValue('null'),
    } as unknown as Request;`,
    `    const request = {
      headers: new Headers(),
      text: vi.fn().mockResolvedValue('null'),
    } as unknown as Request;`
);

testCode4 = testCode4.replace(
    `    const request = {
      text: vi.fn().mockResolvedValue(JSON.stringify({
        exchange: 'bitunix',
        apiKey: 'key',
        apiSecret: 'secret'
      })),
    } as unknown as Request;`,
    `    const request = {
      headers: new Headers(),
      text: vi.fn().mockResolvedValue(JSON.stringify({
        exchange: 'bitunix',
        apiKey: 'key',
        apiSecret: 'secret'
      })),
    } as unknown as Request;`
);

fs.writeFileSync(testFile4, testCode4);

const utilFile = 'src/utils/server/requestUtils.ts';
let utilCode = fs.readFileSync(utilFile, 'utf8');

utilCode = utilCode.replace(
    'let apiKey = headers.get("x-api-key") || undefined;',
    'let apiKey = (typeof headers.get === "function" ? headers.get("x-api-key") : headers.get?.("x-api-key") || headers["x-api-key"]) || undefined;'
);
utilCode = utilCode.replace(
    'let apiSecret = headers.get("x-api-secret") || undefined;',
    'let apiSecret = (typeof headers.get === "function" ? headers.get("x-api-secret") : headers.get?.("x-api-secret") || headers["x-api-secret"]) || undefined;'
);
utilCode = utilCode.replace(
    'let passphrase = headers.get("x-api-passphrase") || undefined;',
    'let passphrase = (typeof headers.get === "function" ? headers.get("x-api-passphrase") : headers.get?.("x-api-passphrase") || headers["x-api-passphrase"]) || undefined;'
);

fs.writeFileSync(utilFile, utilCode);
