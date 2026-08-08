# Error Codes

Quelle: https://www.bitunix.com/api-docs/futures/ErrorCode/error_code.html

Alle Business-Fehlercodes werden mit HTTP-Statuscode `200` zurückgegeben; der
eigentliche Fehler steht im JSON-Feld `code`/`msg` der Response.

| ErrorCode | Description | httpStatusCode |
|-----------|--------------|----------------|
| 0     | Success | 200 |
| 403   | This API key does not support this operation | 200 |
| 10001 | Network Error | 200 |
| 10002 | Parameter Error | 200 |
| 10003 | api-key can't be empty | 200 |
| 10004 | The current ip is not in the apikey ip whitelist | 200 |
| 10005 | Too many requests, please try again later | 200 |
| 10006 | Request too frequently | 200 |
| 10007 | Sign signature error | 200 |
| 10008 | {value} does not comply with the rule, optional [correctValue] | 200 |
| 20001 | Market not exists | 200 |
| 20002 | The current positions amount has exceeded the maximum open limit, please adjust the risk limit | 200 |
| 20003 | Insufficient balance | 200 |
| 20004 | Insufficient Trader | 200 |
| 20005 | Invalid leverage | 200 |
| 20006 | You can't change leverage or margin mode as there are open orders | 200 |
| 20007 | Order not found, please try it later | 200 |
| 20008 | Insufficient amount | 200 |
| 20009 | Position exists, so positions mode cannot be updated | 200 |
| 20010 | Activation failed, the available balance in the futures account does not meet the conditions for activation of the coupon | 200 |
| 20011 | Account not allowed to trade | 200 |
| 20012 | This futures does not allow trading | 200 |
| 20013 | Function disabled due tp pending account deletion request | 200 |
| 20014 | Account deleted | 200 |
| 20015 | This futures is not supported | 200 |
| 20016 | Batch order exceeded the max size | 200 |
| 30001 | Failed to order. Please adjust the order price or the leverage as the order price dealt may immediately liquidate. | 200 |
| 30002 | Price below liquidated price | 200 |
| 30003 | Price above liquidated price | 200 |
| 30004 | Position not exist | 200 |
| 30005 | The trigger price is closer to the current price and may be triggered immediately | 200 |
| 30006 | Please select TP or SL | 200 |
| 30007 | TP trigger price is greater than average entry price | 200 |
| 30008 | TP trigger price is less than average entry price | 200 |
| 30009 | SL trigger price is less than average entry price | 200 |
| 30010 | SL trigger price is greater than average entry price | 200 |
| 30011 | Abnormal order status | 200 |
| 30012 | Already added to favorite | 200 |
| 30013 | Exceeded the maximum order quantity | 200 |
| 30014 | Max Buy Order Price | 200 |
| 30015 | Mini Sell Order Price | 200 |
| 30016 | The qty should be larger than | 200 |
| 30017 | The qty cannot be less than the minimum qty | 200 |
| 30018 | Order failed. No position opened. Cancel [Reduce-only] settings and retry later | 200 |
| 30019 | Order failed. A [Reduce-only] order can not be in the same direction as the open position | 200 |
| 30020 | Trigger price for TP should be higher than mark price: | 200 |
| 30021 | Trigger price for TP should be lower than mark price: | 200 |
| 30022 | Trigger price for SL should be higher than mark price: | 200 |
| 30023 | Trigger price fo SL should be lower than mark price: | 200 |
| 30024 | Trigger price for SL should be lower than liq price: | 200 |
| 30025 | Trigger price for SL should be higher than liq price: | 200 |
| 30026 | TP price must be greater than last price: | 200 |
| 30027 | TP price must be greater than mark price: | 200 |
| 30028 | SL price must be less than last price: | 200 |
| 30029 | SL price must be less than mark price: | 200 |
| 30030 | SL price must be greater than last price: | 200 |
| 30031 | SL price must be greater than mark price: | 200 |
| 30032 | TP price must be less than last price: | 200 |
| 30033 | TP price must be less than mark price: | 200 |
| 30034 | TP price must be less than mark price: | 200 |
| 30035 | SL price must be greater than trigger price: | 200 |
| 30036 | TP price must be greater than trigger price: | 200 |
| 30037 | TP price must be greater than trigger price: | 200 |
| 30038 | TP/SL amount must be less than the size of the position. | 200 |
| 30039 | The order qty can't be greater than the max order qty: | 200 |
| 30040 | Futures trading is prohibited, please contact customer service. | 200 |
| 30041 | Trigger price must be greater than 0 | 200 |
| 30042 | Client ID duplicate | 200 |
| 40001 | Please cancel open orders and close all positions before canceling lead trading | 200 |
| 40002 | Lead amount hast to be over the limits | 200 |
| 40003 | Lead order amount exceeds the limits. | 200 |
| 40004 | Please do not repeat the operation | 200 |
| 40005 | Action is not available for the current user type. | 200 |
| 40006 | Sub-account reaches the limit. | 200 |
| 40007 | Share settlement is being processed,lease try again later | 200 |
| 40008 | After the transfer, the account balance will be less than the order amount, please enter again. | 200 |
