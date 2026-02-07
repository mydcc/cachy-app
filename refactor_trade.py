import os

path = 'src/services/tradeService.ts'
with open(path, 'r') as f:
    content = f.read()

# Exact strings from file (copy-pasted from cat output)
block1_old = """                              const response = await fetch("/api/tpsl", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json", ...(settingsState.appAccessToken ? { "x-app-access-token": settingsState.appAccessToken } : {}) },
                                  body: JSON.stringify(this.serializePayload({
                                      exchange: provider,
                                      apiKey: keys.key,
                                      apiSecret: keys.secret,
                                      action: view,
                                      params
                                  }))
                              });

                              const text = await response.text();
                              const data = safeJsonParse(text);

                              if (data.error) {
                                  if (!String(data.error).includes("code: 2")) { // Symbol not found
                                      logger.warn("market", `TP/SL fetch warning for ${sym}: ${data.error}`);
                                  }
                                  return [];
                              }
                              return Array.isArray(data) ? data : data.rows || [];"""

block1_new = """                              const data = await this.signedRequest<any>("POST", "/api/tpsl", {
                                  exchange: provider,
                                  action: view,
                                  params
                              });
                              return Array.isArray(data) ? data : data.rows || [];"""

catch_old = """                          } catch (e) {
                              logger.warn("market", `TP/SL network error for ${sym}`, e);
                              return [];
                          }"""

catch_new = """                          } catch (e: any) {
                              const msg = e.message || String(e);
                              if (!msg.includes("code: 2") && !msg.includes("Symbol not found")) {
                                  logger.warn("market", `TP/SL error for ${sym}`, e);
                              }
                              return [];
                          }"""

block2_old = """             const response = await fetch("/api/tpsl", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", ...(settingsState.appAccessToken ? { "x-app-access-token": settingsState.appAccessToken } : {}) },
                  body: JSON.stringify({
                      exchange: provider,
                      apiKey: keys.key,
                      apiSecret: keys.secret,
                      action: view,
                  })
             });

             const text = await response.text();
             const data = safeJsonParse(text);
             if (data.error) throw new Error(data.error);

             const list = Array.isArray(data) ? data : data.rows || [];
             list.sort((a: any, b: any) => (b.ctime || b.createTime || 0) - (a.ctime || a.createTime || 0));
             return list;"""

block2_new = """             const data = await this.signedRequest<any>("POST", "/api/tpsl", {
                  exchange: provider,
                  action: view
             });
             const list = Array.isArray(data) ? data : data.rows || [];
             list.sort((a: any, b: any) => (b.ctime || b.createTime || 0) - (a.ctime || a.createTime || 0));
             return list;"""

if block1_old in content:
    content = content.replace(block1_old, block1_new)
    print("Block 1 replaced")
else:
    print("Block 1 NOT found")

if catch_old in content:
    content = content.replace(catch_old, catch_new)
    print("Catch block replaced")
else:
    print("Catch block NOT found")

if block2_old in content:
    content = content.replace(block2_old, block2_new)
    print("Block 2 replaced")
else:
    print("Block 2 NOT found")

with open(path, 'w') as f:
    f.write(content)
