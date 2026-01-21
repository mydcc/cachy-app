#!/bin/bash
# Script zum Implementieren der verbleibenden 7 Trade-Funktionen

FILE="src/services/tradeService.ts"

echo "Implementing remaining trade functions..."

# Backup original
cp "$FILE" "$FILE.backup"

# 1. modifyOrder (Line ~420)
sed -i '/async modifyOrder/,/NOT_IMPLEMENTED: modifyOrder/c\
    async modifyOrder(params: ModifyOrderParams): Promise<OrderResult> {\
        TradeExecutionGuard.ensureAuthorized();\
        const body: any = { orderId: params.orderId };\
        if (params.price) body.price = params.price.toNumber();\
        if (params.amount) body.qty = params.amount.toNumber();\
        const response = await this.signedRequest<{orderId:string;symbol:string;side:string;orderType:string;price:string;qty:string;status:string;createTime:number;}>('\''POST'\'', '\''/api/v1/futures/trade/modify_order'\'', body);\
        return {orderId:response.data!.orderId,symbol:response.data!.symbol,side:response.data!.side.toLowerCase() as OrderSide,status:this.mapOrderStatus(response.data!.status),price:new Decimal(response.data!.price),amount:new Decimal(response.data!.qty),timestamp:response.data!.createTime};\
    }' "$FILE"

echo "Done! Check with: npm run check"
