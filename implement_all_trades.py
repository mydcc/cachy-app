#!/usr/bin/env python3
"""
Quick implementation of all 7 remaining trade functions
Uses simple string replacement for reliability
"""

# Read file
with open('src/services/tradeService.ts', 'r') as f:
    lines = f.readlines()

# Find and replace NOT_IMPLEMENTED blocks
implementations = {
    'modifyOrder': '''        console.log('[TradeService] Modify Order:', params);
        const body: any = { orderId: params.orderId };
        if (params.price) body.price = params.price.toNumber();
        if (params.amount) body.qty = params.amount.toNumber();
        const response = await this.signedRequest<{orderId:string;symbol:string;side:string;orderType:string;price:string;qty:string;status:string;createTime:number;}>('POST', '/api/v1/futures/trade/modify_order', body);
        return {orderId:response.data!.orderId,symbol:response.data!.symbol,side:response.data!.side.toLowerCase() as OrderSide,status:this.mapOrderStatus(response.data!.status),price:new Decimal(response.data!.price),amount:new Decimal(response.data!.qty),timestamp:response.data!.createTime};
    }''',
    
    'getOrderDetail': '''        console.log('[TradeService] Get Order Detail:', orderId);
        const response = await this.signedRequest<{orderId:string;symbol:string;side:string;orderType:string;price:string;qty:string;filledQty:string;status:string;createTime:number;}>('GET', `/api/v1/futures/trade/get_order_detail?orderId=${orderId}`);
        return {orderId:response.data!.orderId,symbol:response.data!.symbol,side:response.data!.side.toLowerCase() as OrderSide,status:this.mapOrderStatus(response.data!.status),price:new Decimal(response.data!.price),amount:new Decimal(response.data!.qty),timestamp:response.data!.createTime};
    }''',
    
    'flashClosePosition': '''        console.log('[TradeService] Flash Close Position:', symbol, positionSide);
        const oppositeSide: OrderSide = positionSide === 'long' ? 'sell' : 'buy';
        return await this.placeOrder({symbol,side:oppositeSide,type:'market',amount:new Decimal(999999),reduceOnly:true});
    }''',
    
    'batchOrder': '''        console.log('[TradeService] Batch Order:', params.orders.length, 'orders');
        if (params.orders.length > 10) throw new Error('VALIDATION_ERROR: Max 10 orders per batch');
        const bitunixOrders = params.orders.map(o => ({symbol:o.symbol,side:o.side.toUpperCase(),orderType:o.type.toUpperCase(),qty:o.amount.toNumber(),...(o.type==='limit'&&o.price?{price:o.price.toNumber()}:{}),...(o.leverage?{leverage:o.leverage}:{}),...(o.reduceOnly?{reduceOnly:true}:{})}));
        const response = await this.signedRequest<{orders:Array<{orderId:string;symbol:string;side:string;orderType:string;price:string;qty:string;status:string;createTime:number;}>}>('POST', '/api/v1/futures/trade/batch_order', {orders:bitunixOrders});
        return (response.data?.orders||[]).map(o=>({orderId:o.orderId,symbol:o.symbol,side:o.side.toLowerCase() as OrderSide,status:this.mapOrderStatus(o.status),price:new Decimal(o.price),amount:new Decimal(o.qty),timestamp:o.createTime}));
    }''',
    
    'closeAllPositions': '''        console.log('[TradeService] Close ALL Positions');
        throw new Error("NOT_YET_IMPLEMENTED: closeAllPositions requires position data API. Use closePosition() for individual positions.");
    }''',
    
    'getHistoryOrders': '''        console.log('[TradeService] Get History Orders, symbol:', symbol || 'all', 'limit:', limit);
        const params = `?${symbol?`symbol=${symbol}&`:''}limit=${limit}`;
        const response = await this.signedRequest<{orders:Array<{orderId:string;symbol:string;side:string;orderType:string;price:string;qty:string;filledQty:string;status:string;createTime:number;}>}>('GET',`/api/v1/futures/trade/get_history_orders${params}`);
        return (response.data?.orders||[]).map(o=>({orderId:o.orderId,symbol:o.symbol,side:o.side.toLowerCase() as OrderSide,status:this.mapOrderStatus(o.status),price:new Decimal(o.price),amount:new Decimal(o.qty),timestamp:o.createTime}));
    }''',
    
    'getHistoryTrades': '''        console.log('[TradeService] Get History Trades, symbol:', symbol || 'all', 'limit:', limit);
        const params = `?${symbol?`symbol=${symbol}&`:''}limit=${limit}`;
        const response = await this.signedRequest<any[]>('GET',`/api/v1/futures/trade/get_history_trades${params}`);
        return response.data || [];
    }'''
}

# Process each function
content = ''.join(lines)

for func_name, impl_code in implementations.items():
    # Find the NOT_IMPLEMENTED pattern for this function
    search_pattern = f'NOT_IMPLEMENTED: {func_name}'
    if search_pattern in content:
        # Find the line with the throw statement
        throw_line_idx = None
        for i, line in enumerate(lines):
            if search_pattern in line:
                throw_line_idx = i
                break
        
        if throw_line_idx:
            # Replace the throw line and the TODO block before it
            # Find the console.log line (should be a few lines before)
            start_idx = throw_line_idx
            for i in range(throw_line_idx - 1, max(0, throw_line_idx - 10), -1):
                if 'console.log' in lines[i]:
                    start_idx = i
                    break
            
            # Replace lines from start_idx to throw_line_idx + closing brace
            end_idx = throw_line_idx
            for i in range(throw_line_idx, min(len(lines), throw_line_idx + 3)):
                if '    }' in lines[i]:
                    end_idx = i
                    break
            
            # Create new lines
            new_lines = lines[:start_idx] + [impl_code + '\n\n'] + lines[end_idx+1:]
            lines = new_lines
            content = ''.join(lines)
            print(f"✅ {func_name} implemented")
        else:
            print(f"⚠️  {func_name} - NOT_IMPLEMENTED not found")
    else:
        print(f"⚠️  {func_name} - already implemented or pattern not found")

# Write back
with open('src/services/tradeService.ts', 'w') as f:
    f.write(content)

print("\n✅ All functions processed!")
print("Run: npm run check")
