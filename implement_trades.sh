#!/bin/bash

# Copyright (C) 2026 MYDCT
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

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
