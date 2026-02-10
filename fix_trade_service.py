import re

path = "src/services/tradeService.ts"
with open(path, "r") as f:
    content = f.read()

# Fix the broken Generic provider block in fetchTpSlOrders
# It currently has "return this.signedRequest... action: cancel... orderId: order.orderId" which is wrong.
# We want to replace the whole "else { ... }" block of fetchTpSlOrders or just the inner part.

# The corrupted part looks like:
#         } else {
#              // Generic provider
#              return this.signedRequest("POST", "/api/tpsl", {
#             action: "cancel",
#             params: {
#                 orderId: order.orderId || order.id,
# ...

broken_generic = r'        } else {\s+// Generic provider\s+return this\.signedRequest\("POST", "/api/tpsl", \{\s+action: "cancel",\s+params: \{[\s\S]*?\}\);'

fixed_generic = """        } else {
             // Generic provider
             const data = await this.signedRequest<any>("POST", "/api/tpsl", {
                  action: view
             });
             const list = Array.isArray(data) ? data : data.rows || [];
             list.sort((a: any, b: any) => (b.ctime || b.createTime || 0) - (a.ctime || a.createTime || 0));
             return list;"""

content = re.sub(broken_generic, fixed_generic, content)

# Now check if cancelTpSlOrder exists. The previous replace might have eaten it if the regex was too greedy.
# In the `sed` output, I saw `modifyTpSlOrder` immediately after the broken block. `cancelTpSlOrder` was missing!

# We need to insert `cancelTpSlOrder` before `modifyTpSlOrder`.
# Find `public async modifyTpSlOrder`
# Insert `cancelTpSlOrder` before it.

cancel_method = """    public async cancelTpSlOrder(order: any) {
        return this.signedRequest("POST", "/api/tpsl", {
            action: "cancel",
            params: {
                orderId: order.orderId || order.id,
                symbol: order.symbol,
                planType: order.planType,
            },
        });
    }

"""

if "public async cancelTpSlOrder" not in content:
    content = content.replace("public async modifyTpSlOrder", cancel_method + "    public async modifyTpSlOrder")

# Fix modifyTpSlOrder
# It also had "action: cancel" and "orderId: order.orderId" (using 'order' instead of 'params')
# We need to correct it.

broken_modify = r'return this\.signedRequest\("POST", "/api/tpsl", \{\s+action: "cancel",\s+params: \{\s+orderId: order\.orderId[\s\S]*?\},?\s+\}\);'

fixed_modify = """return this.signedRequest("POST", "/api/tpsl", {
            action: "modify",
            params: {
                orderId: params.orderId,
                symbol: params.symbol,
                planType: params.planType,
                triggerPrice: params.triggerPrice,
                qty: params.qty
            },
        });"""

content = re.sub(broken_modify, fixed_modify, content)

with open(path, "w") as f:
    f.write(content)

print("Fixed TradeService.ts")
