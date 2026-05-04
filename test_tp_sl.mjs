import { z } from "zod";

const TpSlOrderSchema = z.object({
    orderId: z.string().optional(),
    id: z.string().optional(),
    planId: z.string().optional(),
    symbol: z.string(),
    planType: z.enum(["PROFIT", "LOSS"]).or(z.string()),
    triggerPrice: z.string().optional(),
    qty: z.string().optional(),
    status: z.string().optional(),
    ctime: z.number().optional(),
    createTime: z.number().optional()
}).passthrough();

const data = [{
    id: "123",
    symbol: "BTCUSDT",
    planType: "PROFIT",
    triggerPrice: "50000"
}];

console.log(data.map(d => TpSlOrderSchema.parse(d)));
