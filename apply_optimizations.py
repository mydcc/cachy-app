import re

# 1. TradeService Refactor
trade_path = "src/services/tradeService.ts"
with open(trade_path, "r") as f:
    trade_content = f.read()

# Refactor fetchTpSlOrders inner loop fetch
# We need to find the fetch block inside the loop and replace it.
# This is tricky with regex due to nesting.
# Strategy: Look for the specific fetch call pattern.

# The pattern to replace:
# const response = await fetch("/api/tpsl", {
#     method: "POST",
#     headers: { "Content-Type": "application/json", ...(settingsState.appAccessToken ? { "x-app-access-token": settingsState.appAccessToken } : {}) },
#     body: JSON.stringify(this.serializePayload({
#         exchange: provider,
#         apiKey: keys.key,
#         apiSecret: keys.secret,
#         action: view,
#         params
#     }))
# });
# const text = await response.text();
# const data = safeJsonParse(text);

# Replacement:
# const data = await this.signedRequest<any>("POST", "/api/tpsl", {
#     action: view,
#     params
# });

# We'll use a simplified regex that captures the fetch block loosely.
fetch_pattern = r'const response = await fetch\("/api/tpsl",\s*\{[\s\S]*?body: JSON\.stringify\(this\.serializePayload\(\{[\s\S]*?params\s*\}\)\)\s*\}\s*\);\s*const text = await response\.text\(\);\s*const data = safeJsonParse\(text\);'

fetch_replacement = """const data = await this.signedRequest<any>("POST", "/api/tpsl", {
                                  action: view,
                                  params
                              }).catch(e => ({ error: e.message })); // Catch signedRequest throw to match previous behavior"""

# Note: The original code handled errors manually. signedRequest throws.
# The original code inside the loop:
# if (data.error) { ... return [] }
# So if signedRequest throws, we need to catch it and return an error object so the downstream check works.

trade_content = re.sub(fetch_pattern, fetch_replacement, trade_content)


# Refactor cancelTpSlOrder
cancel_pattern = r'const response = await fetch\("/api/tpsl",\s*\{[\s\S]*?body: JSON\.stringify\(this\.serializePayload\(\{[\s\S]*?params: \{[\s\S]*?\},?\s*\}\)\),\s*\}\);\s*const text = await response\.text\(\);\s*const res = safeJsonParse\(text\);\s*if \(res\.error\) throw new Error\(res\.error\);\s*return res;'

cancel_replacement = """return this.signedRequest("POST", "/api/tpsl", {
            action: "cancel",
            params: {
                orderId: order.orderId || order.id,
                symbol: order.symbol,
                planType: order.planType,
            },
        });"""

trade_content = re.sub(cancel_pattern, cancel_replacement, trade_content)


# Refactor modifyTpSlOrder
modify_pattern = r'const response = await fetch\("/api/tpsl",\s*\{[\s\S]*?body: JSON\.stringify\(this\.serializePayload\(\{[\s\S]*?params: \{[\s\S]*?\},?\s*\}\)\),\s*\}\);\s*const text = await response\.text\(\);\s*const res = safeJsonParse\(text\);\s*if \(res\.error\) throw new Error\(res\.error\);\s*return res;'

modify_replacement = """return this.signedRequest("POST", "/api/tpsl", {
            action: "modify",
            params: {
                orderId: params.orderId,
                symbol: params.symbol,
                planType: params.planType,
                triggerPrice: params.triggerPrice,
                qty: params.qty
            },
        });"""

trade_content = re.sub(modify_pattern, modify_replacement, trade_content)

# Clean up manual key fetching in fetchTpSlOrders (it's at the top of the function)
# We can leave it for now as signedRequest will fetch it again, or we can remove it.
# Removing it might break "if (!keys...)" check if it's done early.
# Actually signedRequest does the check. But the top check is fine.

with open(trade_path, "w") as f:
    f.write(trade_content)
print("Updated TradeService.ts")


# 2. MarketWatcher fix
mw_path = "src/services/marketWatcher.ts"
with open(mw_path, "r") as f:
    mw_content = f.read()

# Find: const klines1 = await apiService.fetchBitunixKlines(symbol, tf, latestLimit);
# Replace with: const klines1 = await apiService.fetchBitunixKlines(symbol, tf, latestLimit, undefined, Date.now());

mw_content = mw_content.replace(
    'const klines1 = await apiService.fetchBitunixKlines(symbol, tf, latestLimit);',
    'const klines1 = await apiService.fetchBitunixKlines(symbol, tf, latestLimit, undefined, Date.now());'
)

with open(mw_path, "w") as f:
    f.write(mw_content)
print("Updated MarketWatcher.ts")
