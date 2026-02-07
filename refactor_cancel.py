import os

path = 'src/services/tradeService.ts'
with open(path, 'r') as f:
    content = f.read()

old_block = """        const response = await fetch("/api/tpsl", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(settingsState.appAccessToken ? { "x-app-access-token": settingsState.appAccessToken } : {}) },
            body: JSON.stringify(this.serializePayload({
                exchange: provider,
                apiKey: keys.key,
                apiSecret: keys.secret,
                action: "cancel",
                params: {
                    orderId: order.orderId || order.id,
                    symbol: order.symbol,
                    planType: order.planType,
                },
            })),
        });

        const text = await response.text();
        const res = safeJsonParse(text);
        if (res.error) throw new Error(res.error);
        return res;"""

new_block = """        return this.signedRequest("POST", "/api/tpsl", {
            exchange: provider,
            action: "cancel",
            params: {
                orderId: order.orderId || order.id,
                symbol: order.symbol,
                planType: order.planType,
            },
        });"""

if old_block in content:
    content = content.replace(old_block, new_block)
    print("Cancel block replaced")
else:
    print("Cancel block NOT found")
    # Debug: print surrounding lines to see mismatch
    start_idx = content.find('const response = await fetch("/api/tpsl", {')
    if start_idx != -1:
        print("Found partial match at", start_idx)
        print(content[start_idx:start_idx+500])

with open(path, 'w') as f:
    f.write(content)
