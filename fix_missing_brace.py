import os

path = "src/services/tradeService.ts"
with open(path, "r") as f:
    content = f.read()

# Look for:
#     }
#
#
#     public async cancelTpSlOrder(order: any) {

# Replace with:
#     }
#     }
#
#     public async cancelTpSlOrder(order: any) {

target = """    }


    public async cancelTpSlOrder(order: any) {"""

replacement = """    }
    }

    public async cancelTpSlOrder(order: any) {"""

content = content.replace(target, replacement)

with open(path, "w") as f:
    f.write(content)

print("Fixed missing brace in TradeService.ts")
