# Error Codes

Source: <https://www.bitget.com/legacy-docs/classic/contract/error-code/restapi>,
<https://www.bitget.com/legacy-docs/classic/contract/error-code/websocket>
Crawled on: 2026-09-28

Bitget publishes two authoritative error-code tables for the Classic
Futures API: one for the REST endpoints and one for the WebSocket channel.
Both are reproduced below verbatim. Earlier revisions of this reference
claimed that no error-code table existed for Classic Futures; that claim was
wrong — the tables have been published at the two source URLs above for
years, and the two pages were crawled in full on the date shown.

Retrieval note: the REST table was fetched twice. The first fetch returned a
truncated body that stopped mid-table at `43117`; the second fetch (plain-text
extraction) returned the complete table from `429` through the trailing
`400171` / `400172` rows. Both tables below are complete; no code range had to
be reconstructed, inferred, or omitted.

## How to read a failure

- Success is `code: "00000"` **inside the response body**, with a
  `"msg": "success"` string. It is not the HTTP status.
- **A business failure arrives as HTTP 200 with a non-zero `code`.** A client
  that branches on the HTTP status alone reads a rejected order as a
  successful fill. This is the single most important fact on this page.
- Some errors also arrive as a non-2xx status *and* a `code` in the body (for
  example `429`). The safe reading is therefore two-sided: treat any non-2xx
  status as a failure regardless, and additionally check `code === "00000"`
  whenever the `data` payload matters.
- Many messages are parameterised with positional placeholders — `"{0}"`,
  `"{1}"`, … — e.g. `00001 startTime and endTime interval cannot be greater
  than {0} days`. The numeric argument is filled in by the server. A client
  **must not** match on the message text: the text is parameterised, it is
  inconsistently capitalised and translated (`40103` vs `40104` differ only in
  the case of one letter), and several rows contain vendor typos. Match on
  `code` only.
- `code` is a string, not a number, on the wire (`"00000"`, not `0`). Parse it
  as a string.

### Code families (REST)

| Range | What lives there |
|-------|------------------|
| `429` | HTTP rate limit (non-2xx status, may also carry a body) |
| `00001`–`01003` | Time-window and parameter validation |
| `11000`–`19000` | Address book, Convert / flash exchange, withdrawals, spot copy trading |
| `20001`–`22067` | Futures trading constraints, margin mode, risk caps, delivery, ADL |
| `31001`–`31057` | Copy Trading (Elite Trader) domain |
| `40000`–`40086` | Signature, credentials, permissions, account state, sub-accounts |
| `40100`–`40200` | Regional restriction, KYC, demo trading, server maintenance |
| `40301`–`40409` | Request shape, `clientOid` limits, routing (`40404`) |
| `40704`–`40766` | Contract order and margin validation |
| `40775`–`40816` | Market-making accounts, margin transfer, leverage |
| `40820`–`40896` | Order price, TP/SL, position management, liquidation-price rules |
| `40897`–`40939` | Experience accounts, transfers, copy-trade lifecycle, risk-control size caps |
| `41002`–`41104` | Generic parameter errors |
| `42013`–`42072` | Transfers, deposit/withdraw support |
| `43001`–`43075` | Order, plan-order and TP/SL validation |
| `43111`–`43137` | Withdrawals, custody sub-account transfers |
| `45001`–`45129` | Legacy order engine, position mode, margin mode, order counting |
| `46013`–`47003` | Sell limits, withdrawal address book |
| `48001`–`48002` | Parameter validation |
| `49000`–`49081` | Institutional / custody (Broker, `cobo`) |
| `50001`–`50081` | Margin-lending account and trading-pair state |
| `59002`–`59049` | Earn / wealth-management products |
| `60001`–`60049` | P2P |
| `70001`–`70229` | Brokerage, convert, daily reset, withdrawal limits |
| `80001`–`80020` | Lending and pledge |
| `90001` | Subscription limit |
| `400171`, `400172` | Trailing rows, out of numeric order — see *Known defects* |

### Code families (WebSocket)

| Range | What lives there |
|-------|------------------|
| `429` | Rate limit |
| `25000`–`25013` | Account and session state (liquidation, risk, mode switches) |
| `25100`–`25110` | Instrument / contract state (delisted, maintenance, init) |
| `25200`–`25245` | Order validation, precision, size and rate limits |
| `25559`–`25612` | Risk unit, sub-account binding, TP/SL and strategy orders |
| `25620`–`25655` | Permissions, loan collateral, TP/SL sanity, bankruptcy price |
| `40001`–`40034`, `40725`, `43117` | Overlap with REST: signature and parameter errors |
| `95001`–`95014` | Institutional loan (`ins loan`) |

## REST error codes

| Error code | Error message |
|------------|---------------|
| 429 | Too many requests |
| 00001 | startTime and endTime interval cannot be greater than {0} days |
| 01001 | {0} must be greater than 0 |
| 01002 | {0} precision must be less than or equal to {1} |
| 01003 | {0} Duplicate data exists |
| 11000 | withdraw address is not in addressBook |
| 12001 | {0} can be used at most |
| 12002 | Current currency {0}, limit net sell value {1} USD |
| 12003 | Current currency {0}, limit net buy value {1} USD |
| 12004 | Quote query failed, try again later |
| 12006 | Minimum limit not reached. |
| 12007 | Maximum limit exceeded. |
| 12008 | Daily individual convert limit reached |
| 12009 | Daily convert limit reached |
| 12014 | Failed to get a quote |
| 12017 | Contact customer service because your Convert permission is abnormal. |
| 12018 | Service disruption, contact customer service for assistance. |
| 12021 | Flash quote expired |
| 12022 | he flash quote information has been tampered with |
| 13001 | Withdraw is too frequent |
| 13002 | Currency does not exist |
| 13004 | Your remaining withdrawal amount{0} |
| 13005 | Failed to generate address |
| 13006 | The actual amount you can withdraw is {0}, and the rest is frozen for copy trade |
| 13007 | The current currency is {0}, and the net purchase value of {1} USD is limited within 24 hours, and the net purchase value of {2} USD is also allowed for {3} |
| 13008 | Traders minimum place orderSize is {0} |
| 13009 | Current currency {0}, 24-hour limit on net selling value {1} USD, you can also net sell {3} worth {2} USD |
| 13010 | The order is review, cannot be cancelled. |
| 13212 | A single withdrawal exceeds the maximum limit |
| 19000 | Spot copy trading operation failed |
| 20001 | startTime should be less than endTime |
| 20002 | {0} Only one is allowed to be passed |
| 22001 | No order to cancel |
| 22002 | No position to close |
| 22003 | modify price and size, please pass in newClientOid |
| 22004 | This symbol {0} not support API trade |
| 22005 | This symbol does not support  cross mode |
| 22006 | limit price > risk price |
| 22007 | limit price < risk price |
| 22008 | market price > risk price |
| 22009 | market price < risk price |
| 22010 | Please bind ip whitelist address |
| 22011 | It is not allowed to set auto add margin in  cross mode |
| 22012 | There are different business lines, {0} does not belong to {1} product |
| 22013 | Abnormal status of position experience coupon |
| 22014 | This position experience coupon does not exist |
| 22015 | This user has no position experience coupon sub-account |
| 22016 | This user is not a sub-account for position experience coupons and cannot operate experience coupons |
| 22017 | The position experience coupon does not support this tokenId |
| 22018 | The face value of the position experience coupon is a negative number |
| 22019 | The position experience coupon has not expired yet |
| 22020 | The leverage multiple is the leverage multiple of the current position and cannot be adjusted. |
| 22021 | Limit orders are not supported when placing orders with position experience coupons |
| 22022 | The position experience coupon has been used |
| 22023 | The trial coupon for this position has expired |
| 22024 | The experience coupon for this position has been recycled |
| 22025 | Margin cannot be added to the experience coupon account |
| 22026 | The position mode cannot be adjusted for the experience coupon account |
| 22027 | The position experience coupon does not support this currency pair |
| 22028 | The position experience coupon does not support this type of order |
| 22029 | Risk control, you can currently open a maximum position of {0} {1}. The risk control proportion limit for a uid is calculated including all main accounts and sub-accounts. |
| 22030 | {0} Demo trading mode，can not use:{1} |
| 22034 | Less than the minimum order amount |
| 22035 | Demo account open position too frequently |
| 22038 | Please enter the quantity as an integral multiple of {0} |
| 22039 | Limit open position when delivery is approaching. |
| 22040 | Limit open order when delivery is approaching. |
| 22041 | Limit close order when delivery is approaching. |
| 22042 | When a one-way position is held, trigger order cannot only reduce positions. |
| 22043 | ADL processing，{0} is limit close position |
| 22044 | ADL processing，cannot flash close Position |
| 22045 | Insufficient liquidity in the market, please operate later |
| 22067 | ADL processing，forbid operate the symbol:{0} |
| 31001 | The user is not a trader |
| 31002 | Condition {0} is not satisfied |
| 31003 | Parameter {0} must have a value, cannot be empty |
| 31004 | Take profit price must be > current price |
| 31005 | Stop loss price must be < current price |
| 31006 | The order is in the process of being placed, closing of the position is not supported at the moment |
| 31007 | Order does not exist |
| 31008 | There is no position in this position, no take profit or stop loss order can be made |
| 31009 | Tracking order status error |
| 31010 | Clear user prompt |
| 31011 | The order is not completely filled and the order is closed prompting the cancellation of the commission |
| 31012 | Pullback greater than {0} |
| 31013 | Pullback range is less than {0} |
| 31014 | Stop gain yield greater than {0} |
| 31015 | Stop loss yield less than {0} |
| 31016 | Batch execution exception |
| 31017 | Maximum price limit exceeded {0} |
| 31018 | Minimum price change of {0} |
| 31019 | Support trading currency pair does not exist |
| 31020 | Business is restricted |
| 31021 | The currency pair is not available for trading, please select another currency pair |
| 31022 | Minimum order size for this trading area is not met, please select another trading area |
| 31023 | Ending order processing |
| 31024 | The order is not completely filled, please go to "Spot trading"-"Current orders" to cancel the order and then sell or close the operation! |
| 31025 | The user is not a trader |
| 31026 | The user is not exist |
| 31028 | Parameter verification failed |
| 31029 | User is not existed |
| 31030 | Chosen trading pair is empty |
| 31031 | You’re log in as trader,can not follow trade |
| 31032 | Can not follow trade with yourself |
| 31033 | Fail to remove |
| 31034 | This trader’s no. of follower has reached limit, please select other trader |
| 31035 | Follow order ratio can not less than{0} |
| 31036 | Follow order ratio can not greater than{0} |
| 31037 | Follow order count can not less than{0} |
| 31038 | Exceeds max. limit |
| 31039 | Can not set reminder as your Elite Trader status has been revoked |
| 31040 | T/P ratio must between {0}%%-{1}%% |
| 31041 | S/L ratio must between {0}%%-{1}%% |
| 31042 | The status of your Elite Trader has been suspended, please contact online customer service to resume. |
| 31043 | Your copy trade follower cap is too high. Please contact customer support to lower it if you want to enable this function! |
| 31044 | You are applying to become a trader now. Copying trade is not allowed |
| 31045 | The max. quantity for TP/SL is {0}. For any quantity exceeding this limit, please operate under “Initiated Copies”. |
| 31046 | No copy trade relationship is allowed between a parent account and its sub-account |
| 31047 | No copying is allowed within {0} minutes after the copier has been removed. Please try again later. |
| 31048 | Only this trader's referrals are allowed to follow this trader at the moment. Please create an account with the trader's referral link! |
| 31049 | The trader's status is abnormal or has been revoked, and cannot be viewed at this time! |
| 31050 | This trader UID is already set for the region. |
| 31051 | traderUserId error |
| 31052 | Cannot set trading symbol that have not been opened by traders. |
| 31053 | executePrice cannot exceed triggerPrice 的{0} |
| 31054 | No order to cancel |
| 31057 | user has not follow order |
| 40000 | Bitget is providing services to many countries and regions around the world and strictly adheres to the rules and regulatory requirements of each country and region. According to the relevant regulations, Bitget is currently unable to provide services to your region (Mainland China) and you do not have access to open positions.Apologies for any inconvenience caused! |
| 40001 | ACCESS_KEY cannot be empty |
| 40002 | ACCESS_SIGN cannot be empty |
| 40003 | Signature cannot be empty |
| 40005 | Invalid ACCESS_TIMESTAMP |
| 40006 | Invalid ACCESS_KEY |
| 40007 | Invalid Content_Type |
| 40008 | Request timestamp expired |
| 40009 | sign signature error |
| 40010 | Request timed out |
| 40011 | ACCESS_PASSPHRASE cannot be empty |
| 40012 | apikey/password is incorrect |
| 40013 | User status is abnormal |
| 40014 | Incorrect permissions, need {0} permissions |
| 40015 | System is abnormal, please try again later |
| 40016 | The user must bind the phone or Google |
| 40017 | Parameter verification failed {0} |
| 40018 | Invalid IP |
| 40019 | Parameter {0} cannot be empty |
| 40020 | Parameter {0} error |
| 40021 | User disable withdraw |
| 40022 | The business of this account has been restricted |
| 40023 | API service has been restricted. For any inquiries, please contact customer service |
| 40024 | Account has been frozen |
| 40025 | The user does not have this permission |
| 40026 | User is disabled |
| 40027 | Withdrawals in this account area must be kyc |
| 40028 | This subUid does not belong to this account |
| 40029 | This account is not a Broker, please apply to become a Broker first |
| 40031 | The account has been cancelled and cannot be used again |
| 40032 | The Max of sub-account created has reached the limit |
| 40033 | This email has been bound |
| 40034 | Parameter {0} does not exist |
| 40035 | Judging from your login information, you are required to complete KYC first for compliance reasons. |
| 40036 | passphrase is error |
| 40037 | Apikey does not exist |
| 40038 | The current ip is not in the apikey ip whitelist |
| 40039 | FD Broker's user signature error |
| 40040 | user api key permission setting error |
| 40041 | User's ApiKey does not exist |
| 40043 | FD Broker does not exist |
| 40045 | The bound user cannot be an FD broker |
| 40047 | FD Broker binding related interface call frequency limit |
| 40048 | The user's ApiKey must be the parent account |
| 40049 | User related fields decrypt error |
| 40051 | This account is not a FD Broker, please apply to become a FD Broker first |
| 40052 | Security settings have been modified for this account. For the safety of your account, withdrawals are prohibited within 24 hours |
| 40053 | Value range verification failed: {0} should be between {1} |
| 40054 | The data fetched by {0} is empty |
| 40055 | subName must be an English letter with a length of 8 |
| 40056 | remark must be length of 1 ~ 20 |
| 40057 | Parameter {0} {1} does not meet specification |
| 40058 | Parameter {0} Only a maximum of {1} is allowed |
| 40059 | Parameter {0} should be less than {1} |
| 40060 | subNames already exists |
| 40061 | sub-account not allow access |
| 40063 | API exceeds the maximum limit added |
| 40064 | Parameter verification failed |
| 40065 | This subApikey does not exist |
| 40066 | This subUid does not belong to the account or is not a virtual sub-account |
| 40067 | Account creation failed |
| 40068 | Disable subaccount access |
| 40069 | The maximum number of sub-accounts created has been reached |
| 40070 | passphrase 8-32 characters with letters and numbers |
| 40071 | subName exist duplication |
| 40072 | symbol {0} is Invalid or not supported mix contract trade |
| 40074 | {0} MatchRunServer not exist |
| 40077 | Transfers from custody sub-accounts are only allowed between spot and contract accounts. |
| 40078 | Timestamp for this request is outside of the ME receiveWindow. |
| 40079 | receiveWindow timestamp must be less than 60s |
| 40081 | Spot DEMO accounts can only access spot orders and spot plan order endpoints. |
| 40086 | An error occurred when accessing the VIP private domain name. Please check whether you have applied for it. |
| 40100 | Due to regulatory requirements, Hong Kong IPs are required to complete identity verification first |
| 40101 | Please complete KYC |
| 40102 | Symbol does not exist |
| 40103 | based on your IP address , it appears that you are located in a country or region where we are currently unable to provide services |
| 40104 | Based on your IP address , it appears that you are located in a country or region where we are currently unable to provide services |
| 40104 | Unable to withdraw to this account Please make sure this is a valid and verified account |
| 40105 | Currently Spot Demo trade does not support this feature |
| 40107 | The subaccountName has been used |
| 40108 | The subaccountName has been used |
| 40109 | The data of the order cannot be found, please confirm the order number |
| 40110 | It is currently unavailable in a demo trading |
| 40111 | If you are located in a country where our services are restricted, please complete the KYC verification. If you have any questions, please contact customer service. |
| 40199 | Traders are prohibited from calling the API |
| 40200 | Server upgrade, please try again later |
| 40301 | Permission has not been obtained yet. If you need to use it, please contact customer service |
| 40303 | Can only query up to 20,000 data |
| 40304 | clientOid or clientOrderId length cannot greater than 50 |
| 40305 | clientOid or clientOrderId length cannot greater than 64, and cannot be Martian characters |
| 40306 | Batch processing orders can only process up to 20 |
| 40309 | The contract has been removed |
| 40402 | orderId or clientOId format error |
| 40404 | Request URL NOT FOUND |
| 40407 | The query direction is not the direction entrusted by the plan |
| 40408 | Range error |
| 40409 | wrong format |
| 40704 | Can only check the data of the last three months |
| 40705 | The start and end time cannot exceed 90 days |
| 40706 | Wrong order price |
| 40707 | Start time is greater than end time |
| 40710 | The Account has been frozen. |
| 40714 | No direct margin call is allowed |
| 40715 | delegate count can not high max of open count |
| 40716 | This trading pair not support Cross Margin mode |
| 40717 | The number of closed positions cannot exceed the number of sheets held |
| 40718 | The entrusted price of Pingduo shall not be lower than the bursting price |
| 40719 | Flat empty entrustment price is not allowed to be higher than explosion price |
| 40720 | swap hand depth does not exist |
| 40721 | Market price list is not allowed at present |
| 40722 | Due to excessive price fluctuations and the  insufficient market price entrusted cost,  the opening commission is failed. |
| 40723 | The total number of unexecuted orders is too high |
| 40724 | Parameter is empty |
| 40725 | service return an error |
| 40730 | There is currently a commission or a planned commission, and the leverage cannot be adjusted |
| 40732 | Not currently a trader |
| 40734 | Failed to place an order, the minimum number of traders to open a position {0} |
| 40744 | The tracking order status is wrong |
| 40746 | The current maximum number of positions that can be closed is {0}, if you exceed the number, please go to the current order to close the position |
| 40748 | The commission price is higher than the highest bid price |
| 40752 | You are disabled for current business, if you have any questions, please contact customer service |
| 40753 | The contract transaction business is disabled, if you have any questions, please contact customer service |
| 40754 | balance not enough |
| 40755 | Not enough open positions are available. |
| 40756 | The balance lock is insufficient. |
| 40757 | Not enough position is available. |
| 40758 | The position lock is insufficient. |
| 40760 | Account abnormal status |
| 40761 | The total number of unfilled orders is too high |
| 40762 | The order size is greater than the max open size |
| 40764 | The remaining amount of the order is less than the current transaction volume |
| 40765 | The remaining volume of the position is less than the current transaction volume |
| 40766 | The number of open orders is less than this transaction volume |
| 40775 | The market-making account can only be a unilateral position type. |
| 40778 | Coin pair {0} does not support {1} currency as margin |
| 40780 | There are multiple risk handling records for the same symbolId at the same time |
| 40781 | The transfer order was not found |
| 40782 | Internal transfer error |
| 40783 | No gear found |
| 40784 | Need to configure modify depth account |
| 40785 | Need to configure draw line account |
| 40788 | Internal batch transfer error |
| 40789 | The tokenId is duplicated in the configuration item |
| 40790 | Duplicate symbolCode in configuration item |
| 40791 | The baseToken or quoteToken of symbolCode does not exist |
| 40792 | The symbol in the configuration item is duplicated |
| 40793 | The symbolCode of BusinessSymbol does not exist |
| 40794 | The supportMarginToken of BusinessSymbol is not configured |
| 40798 | Insufficient contract account balance |
| 40799 | Cannot be less than the minimum transfer amount |
| 40800 | Insufficient amount of margin |
| 40801 | Cannot exceed the maximum transferable deposit amount |
| 40802 | Position is zero and direct margin call is not allowed |
| 40804 | The number of closed positions cannot exceed the number of positions held |
| 40805 | Unsupported operation |
| 40806 | Unsupported currency |
| 40807 | The account does not exist |
| 40808 | Parameter verification exception {0} |
| 40811 | The parameter {0} should not be null |
| 40812 | The condition {0} is not met |
| 40813 | The parameter {0} must have a value and cannot be empty |
| 40814 | No change in leverage |
| 40815 | The order price is higher than the highest bid price |
| 40816 | The order price is lower than the lowest selling price |
| 40820 | The order price for closing a long position is not allowed to be lower than the liquidation price |
| 40821 | The closing order price cannot be higher than the liquidation price |
| 40822 | The contract configuration does not exist |
| 40823 | The transaction or reasonable marked price does not exist |
| 40824 | Currently, it is not allowed to list market orders |
| 40825 | Contract opponent depth does not exist |
| 40826 | Due to excessive price fluctuations, the market order cost is insufficient, and the position opening order failed. |
| 40827 | The bonus is not allowed to hold two-way positions |
| 40828 | Special market making accounts cannot manually place orders |
| 40829 | The take profit price of a long position should be greater than the average open price |
| 40830 | The take profit price of the long position should be greater than the current price |
| 40831 | The short position take profit price should be less than the average open price |
| 40832 | The take profit price of short positions should be less than the current price |
| 40833 | The stop loss price of a long position should be less than the average opening price |
| 40834 | The stop loss price of the long position should be less than the current price |
| 40835 | The stop loss price of the short position should be greater than the average opening price |
| 40836 | The stop loss price of the short position should be greater than the current price |
| 40837 | There is no position in this position, so stop-profit and stop-loss orders cannot be made |
| 40838 | There is no position in this position, and automatic margin call cannot be set |
| 40839 | The automatic margin call function of this contract has been suspended |
| 40840 | Duplicate shard market making account |
| 40841 | Online environment does not allow execution |
| 40842 | Current configuration does not allow adjustment, please try again later |
| 40843 | no_datasource_key_exists |
| 40844 | This contract is under temporary maintenance |
| 40845 | This contract has been removed |
| 40846 | Status verification abnormal |
| 40847 | The operation cannot be performed |
| 40848 | Cannot open a copy transaction if there is a position |
| 40850 | The copy is in progress, the balance cannot be transferred |
| 40851 | Account status is wrong, cannot end copying |
| 40852 | There are unfilled orders, cannot end the copy |
| 40853 | There is an unexecuted plan order, cannot end the copy |
| 40854 | This product does not support copy trading |
| 40855 | The user has ended copying and cannot end copying again |
| 40856 | Data abnormal |
| 40857 | Document number error |
| 40858 | Error tracking order status |
| 40859 | This order is being closed and cannot be closed again |
| 40860 | The trader does not exist and cannot be set to follow |
| 40861 | The trader has been disabled and cannot be set to follow |
| 40862 | Please cancel the current order |
| 40863 | Please cancel the current plan |
| 40864 | Please close the current position with orders |
| 40865 | This order is being commissioned, and it is not currently supported to close the position |
| 40866 | You are currently a trader, please close the position under the current order |
| 40867 | Currently the maximum number of positions that can be closed is {0}, please go to the current order to close the position if the amount exceeds |
| 40868 | You are currently a trader and currently do not support liquidation through planned orders |
| 40869 | You are currently a trader and currently do not support modification of leverage |
| 40871 | The leverage does not meet the configuration, and you cannot become a trader |
| 40872 | Failed to adjust position, currently holding position or order or plan order |
| 40873 | The account has a margin and needs to be transferred out |
| 40874 | Whole position mode does not support automatic margin call |
| 40875 | Whole position mode does not support margin adjustment |
| 40877 | Too many follow-up orders |
| 40878 | The contract index data is abnormal. In order to avoid causing your loss, please try again later. |
| 40879 | The risk is being processed, and the funds cannot be adjusted. |
| 40880 | The risk is being processed and the leverage cannot be adjusted. |
| 40887 | Failed to place the order, the number of single lightning open positions is at most {0} |
| 40888 | Failed to place the order, the maximum amount of single lightning closing is {0} |
| 40889 | The plan order of this contract has reached the upper limit |
| 40890 | The order of stop-profit and stop-loss for this contract has reached the upper limit |
| 40891 | Insufficient position, can not set take profit or stop loss |
| 40892 | Failed to place the order, the minimum number of positions opened by the trader is {0} |
| 40893 | Unable to update the leverage factor of this position, there is not enough margin! |
| 40894 | The documentary closing has been processed |
| 40895 | The preset price does not match the order/execution price |
| 40896 | The default stop profit and stop loss has been partially fulfilled and cannot be modified |
| 40897 | The system experience gold account does not exist |
| 40898 | The system experience gold account balance is insufficient |
| 40899 | The number of stored users exceeds the limit |
| 40900 | The system experience gold account is inconsistent |
| 40901 | The contract experience fund balance is insufficient |
| 40902 | Future time is not allowed |
| 40903 | Failed to obtain leverage information |
| 40904 | Failed to collect funds |
| 40905 | Failed to collect user funds |
| 40906 | Failed to pay user funds |
| 40907 | The payment cannot be transferred |
| 40908 | Concurrent operation failed |
| 40909 | Transfer processing |
| 40910 | Operation timed out |
| 40912 | single cancel cannot exceed 50 |
| 40913 | {0} must be passed one |
| 40914 | Trader the maximum leverage can use is {0} |
| 40915 | Long position take profit price please > mark price |
| 40916 | Futures services for this account have been restricted. |
| 40917 | Stop price for long positions please < mark price {0} |
| 40918 | Traders open positions with orders too frequently |
| 40919 | This function is not open yet |
| 40920 | Position or order exists, the position mode cannot be switched |
| 40921 | The order size cannot exceed the maximum size of the positionLevel |
| 40922 | Only work order modifications are allowed |
| 40923 | Order size and price have not changed |
| 40924 | orderId and clientOid must have one |
| 40925 | price or size must be passed in together |
| 40927 | The return field type or dest of this order does not meet expectations |
| 40928 | Risk control, currently your max open size is {0} {1}. The size was calculated with all the main-sub accounts |
| 40929 | TraderPro Maximum leverage is {0}X |
| 40930 | The remaining quantity for your normal order is {0}{1}, and the quantity for post only order is {2}{3} |
| 40931 | Trigger the risk control of position closing , prohibiting position closing |
| 40936 | The received red envelope of {1} USDT is restricted from transfer for 24 hours; the {0} USDT purchased via OTC is restricted from transfer for 24 hours; {2} USDT is temporarily frozen as the recharge has not reached the required number of confirmations |
| 40937 | Your available withdrawal amount is {0} |
| 40939 | Reducing positions only will decrease your position. Please cancel or modify the original pending order first before placing a new order |
| 41002 | param error {0} |
| 41100 | error {0} |
| 41101 | param {0} error |
| 41103 | param {0} error |
| 41104 | Unsupported coin: {0} |
| 42013 | transfer fail |
| 42014 | The current currency does not support deposit |
| 42015 | The current currency does not support withdrawal |
| 42016 | symbol {0} is Invalid or not supported spot trade |
| 42017 | The current chain does not support deposit the coin |
| 42072 | Param endTime cannot be earlier than startTime |
| 43001 | The order does not exist |
| 43002 | Pending order failed |
| 43003 | Pending order failed |
| 43004 | There is no order to cancel |
| 43005 | Exceed the maximum number of orders |
| 43006 | The order quantity is less than the minimum transaction quantity |
| 43007 | The order quantity is greater than the maximum transaction quantity |
| 43008 | The current order price cannot be less than {0}{1} |
| 43009 | The current order price exceeds the limit {0}{1} |
| 43010 | The transaction amount cannot be less than {0}{1} |
| 43011 | The parameter does not meet the specification {0} |
| 43012 | Insufficient balance |
| 43013 | Take profit price needs> current price |
| 43014 | Take profit price needs to be <current price |
| 43015 | Stop loss price needs to be < current price |
| 43016 | Stop loss price needs to> current price |
| 43017 | You are currently a trader and currently do not support liquidation through planned orders |
| 43020 | Stop profit and stop loss order does not exist |
| 43021 | The stop-profit and stop-loss order has been closed |
| 43022 | Failed to trigger the default stop loss |
| 43023 | Insufficient position, can not set profit or stop loss |
| 43024 | Take profit/stop loss in an existing order, please change it after canceling all |
| 43025 | Plan order does not exist |
| 43026 | The planned order has been closed |
| 43027 | The minimum order value {0} is not met |
| 43028 | Please enter an integer multiple of {0} for price |
| 43029 | The size of the current Order > the maximum number of positions that can be closed |
| 43030 | Take profit order already existed |
| 43031 | Stop loss order already existed |
| 43032 | rangeRate is smaller than {0} |
| 43033 | Trailing order does not exist |
| 43034 | The trigger price should be ≤ the current market price |
| 43035 | The trigger price should be ≥ the current market price |
| 43036 | Trader modify tpsl can only be operated once within 300ms |
| 43037 | The minimum order amount allowed for trading is {0} |
| 43038 | The maximum order amount allowed for trading is {0} |
| 43039 | Maximum price limit exceeded {0} |
| 43040 | Minimum price limit exceeded {0} |
| 43041 | Maximum transaction amount {0} |
| 43042 | Minimum transaction amount {0} |
| 43043 | There is no position |
| 43044 | The follow order status error |
| 43045 | The trader is ful |
| 43047 | Followers are not allowed to follow again within xx minutes after being removed, please try again later! |
| 43048 | The symbol is null |
| 43049 | Margin coin is not allowed |
| 43050 | Leverage exceeds the effective range |
| 43051 | Maximum limit exceeded |
| 43052 | Follow order count can not less than {0} |
| 43053 | The copy ratio cannot exceed {0} |
| 43054 | The copy ratio cannot be less than {0} |
| 43055 | The take loss ratio must be between {0}-{1} |
| 43056 | The take profit ratio must be between {0}-{1} |
| 43057 | It is not allowed to bring orders or copy orders between sub-accounts |
| 43058 | Parameter verification failed |
| 43059 | Request failed, please try again |
| 43060 | Sort rule must send |
| 43061 | Sort Flag must send |
| 43062 | not to follow |
| 43063 | Can not follow trade with yourself |
| 43064 | Tracking order status error |
| 43065 | Tracking No does not exist |
| 43066 | The trader failed to remove the follower |
| 43067 | The loaded data has reached the upper limit, and the maximum support for loading {0} data |
| 43068 | The status of the current follower is abnormal and removal is not allowed for now |
| 43069 | A follower account can only be removed when its equity is lower than {0} USDT |
| 43071 | Trigger order limit for a single trading pair is {0} |
| 43075 | Position pattern mismatch |
| 43111 | param error {0} |
| 43112 | The amount of coins withdrawn is less than the handling fee {0} |
| 43113 | The daily limit {0} is exceeded in a single transaction |
| 43114 | Withdrawal is less than the minimum withdrawal count {0} |
| 43116 | This chain requires a tag to withdraw coins |
| 43117 | Exceeds the maximum amount that can be transferred |
| 43118 | clientOrderId duplicate |
| 43121 | Withdrawal address cannot be your own |
| 43122 | The purchase limit of this currency is {0}, and there is still {1} left |
| 43123 | param error {0} |
| 43124 | withdraw step is error |
| 43125 | No more than 8 decimal places |
| 43126 | This currency does not support withdrawals |
| 43127 | Sub transfer not by main account, or main/sub relationship error |
| 43128 | Exceeded the limit of the maximum number of orders for the total transaction pair {0} |
| 43129 | Transfer coin not support or invalid coin |
| 43130 | StartTime params error |
| 43131 | Current currency: {0} does not support convert |
| 43132 | {0}Insufficient funds |
| 43134 | Transfers from custody sub-accounts are only allow transfers from spot accounts |
| 43136 | The transferred account is frozen |
| 43137 | Transfer in progress |
| 45001 | Unknown error |
| 45002 | Insufficient asset |
| 45003 | Insufficient position |
| 45004 | Insufficient lock-in asset |
| 45005 | Insufficient available positions |
| 45006 | Insufficient position |
| 45007 | Insufficient lock position |
| 45008 | No assets |
| 45009 | The account is at risk and cannot perform trades temporarily |
| 45011 | Order remaining volume < Current transaction volume |
| 45012 | Remaining volume of position < Volume of current transaction |
| 45013 | The number of open orders < Current transaction volume |
| 45014 | Position does not exist during opening |
| 45017 | Settlement or the coin for transaction configuration not found |
| 45018 | In the case of a netting, you cannot have a liquidation order |
| 45019 | Account does not exist |
| 45020 | Liquidation can only occur under two-way positions |
| 45021 | When one-way position is held, the order type must also be one-way position type |
| 45023 | Error creating order |
| 45024 | Cancel order error |
| 45025 | The currency pair does not support the currency as a margin |
| 45026 | Please check that the correct delegateType is used |
| 45031 | The order is finalized |
| 45034 | clientOid duplicate |
| 45035 | Price step mismatch |
| 45043 | Due to settlement or maintenance reasons, the trade is suspended |
| 45044 | Leverage is not within the suitable range after adjustment |
| 45045 | Exceeds the maximum possible leverage |
| 45047 | Reduce the leverage and the amount of additional margin is incorrect |
| 45051 | Execution price parameter verification is abnormal |
| 45052 | Trigger price parameter verification anbormal |
| 45054 | No change in leverage |
| 45055 | The current order status cannot be cancelled |
| 45056 | The current order type cannot be cancelled |
| 45057 | The order does not exist! |
| 45060 | TP price of long position > Current price {0} |
| 45061 | TP price of short position < Current price {0} |
| 45062 | SL price of long position < Current price {0} |
| 45064 | TP price of long position > order price {0} |
| 45065 | TP price of short position < order price {0} |
| 45066 | SL price of long position < order price {0} |
| 45067 | SL price of short position > order price {0} |
| 45068 | There is no position temporarily, and the order of TP and SL cannot be carried out |
| 45075 | The user already has an ongoing copy trade |
| 45082 | Copy trade number error |
| 45089 | You are currently copy trading, leverage cannot be changed |
| 45091 | Too many tracking orders |
| 45097 | There is currently an order or a limit order, and the leverage cannot be adjusted |
| 45098 | You are currently a trader and cannot be switched to the full position mode |
| 45099 | When there are different coins, it cannot be adjusted to Isolated Margin mode |
| 45100 | When a one-way position is held, it cannot be adjusted to the Isolated Margin mode |
| 45101 | In Isolated Margin mode, it cannot be adjusted to a one-way position |
| 45102 | In the full position mode, the automatic margin call cannot be adjusted |
| 45103 | Failed to place an order, the maximum amount of single flash opening position is %s |
| 45104 | Failed to place an order, the maximum amount of single flash closing position is %s |
| 45107 | API is restricted to open positions. If you have any questions, please contact our customer service |
| 45108 | API is restricted to close position. If you have any questions, please contact our customer service |
| 45109 | The current account is a two-way position |
| 45110 | less than the minimum amount {0} USDT |
| 45111 | less than the minimum order quantity |
| 45112 | more than the maximum order quantity |
| 45113 | Maximum order value limit triggered |
| 45114 | The minimum order requirement is not met |
| 45115 | The price you enter should be a multiple of {0} |
| 45116 | The count of positions hold by the account exceeds the maximum count {0} |
| 45117 | Currently holding positions or orders, the margin mode cannot be adjusted |
| 45118 | Reached the upper limit of the order of transactions (the current number of order + the current number of orders) {0} |
| 45119 | This symbol does not support position opening operation |
| 45120 | size > max can open order size |
| 45121 | The reasonable mark price deviates too much from the market, and your current leveraged position opening risk is high |
| 45122 | Short position stop loss price please > mark price {0} |
| 45123 | Insufficient availability, currently only market orders can be placed |
| 45124 | Please edit and submit again. |
| 45127 | Position brackets disabled TP SL |
| 45128 | Position brackets disabled modify qty |
| 45129 | Cancel order is too frequent, the same orderId is only allowed to be canceled once in a second |
| 46013 | This symbol limits the selling amount{0}，Remaining{0} |
| 47001 | Currency recharge is not enabled |
| 47002 | Address verification failed |
| 47003 | Withdraw address is not in addressBook |
| 48001 | Parameter validation failed {0} |
| 48002 | Missing request Parameter |
| 49000 | apiKey and userId mismatch |
| 49001 | not custody account, operation deny |
| 49002 | missing http header: ACCESS-BROKER-KEY or ACCESS-BROKER-SIGN |
| 49003 | illegal IP, access deny |
| 49004 | illegal ACCESS-BROKER-KEY |
| 49005 | access deny: sub account |
| 49006 | ACCESS-BROKER-SIGN check sign fail |
| 49007 | account is unbound |
| 49008 | account is bound |
| 49009 | clientUserId check mismatch with the bound user ID |
| 49010 | account: {0} still have assets: {1} |
| 49011 | kyc must be done before bind |
| 49021 | operation accepted |
| 49022 | access deny |
| 49023 | insufficient fund |
| 49024 | {0} decimal precision error |
| 49025 | Parameter mismatch with the initial requestId, request body: {0} |
| 49026 | {0} maximum {1} digits |
| 49030 | custody account, operation deny |
| 49040 | Unknown Error |
| 49050 | unsupported chain |
| 49051 | Missing callback signature request header |
| 49052 | callback signature verification failed |
| 49053 | can not bind other platforms |
| 49060 | The switch of adding money to cobo is not turned on |
| 49061 | The custody currency is not allowed |
| 49062 | fundId is invalid or not exist {0} |
| 49063 | The custody currency already exists |
| 49064 | Insufficient amount of shadow account |
| 49065 | User withdrawal address already exists |
| 49066 | The switch of cobo money reduction is not turned on |
| 49067 | fundSupplementId is invalid {0} |
| 49068 | No currency available for settlement |
| 49069 | There is an unfinished fund process, which cannot be cleared and settled |
| 49070 | Clearing settlement must include all currencies |
| 49071 | fundSettlementId is invalid {0} |
| 49072 | Failed to get user assets |
| 49073 | Confirm that the set of fundIds receivable for clearing and settlement is not all fundIds |
| 49074 | The settlement process has not been completed, and fund operations cannot be performed |
| 49075 | Failed to query the address list of bg clearing and settlement account |
| 49076 | cobo callback params error |
| 49077 | Failed to call the cobo transaction query interface |
| 49078 | cobo withdrawal transaction callback requestId is invalid {0} |
| 49079 | supplement type illegal |
| 49080 | cobo confirms settlement, txId is invalid |
| 49081 | Request amount parameter error |
| 50001 | coin {0} does not support cross |
| 50002 | symbol {0} does not support isolated |
| 50003 | coin {0} does not support isolated |
| 50004 | symbol {0} does not support cross |
| 50011 | Parameter verification error |
| 50012 | The account has been suspended or deleted. Please contact our Customer Support |
| 50013 | The account has been suspended and deleted. Please contact our Customer Support |
| 50014 | The account already exists |
| 50015 | Currently, sub-accounts cannot engage in margin trading |
| 50016 | The number of open orders is smaller than the minimum limit of the trading pair |
| 50017 | The number of open orders is bigger than the maximum limit of the trading pair |
| 50018 | The price must be 0 or higher |
| 50019 | The user is forbidden to trade. |
| 50020 | Insufficient balance |
| 50021 | The margin trading account does not exist |
| 50022 | The account is liquidated |
| 50023 | The account has been suspended due to abnormal behavior. Please contact our Customer Support is you have any questions. |
| 50024 | The trading pair does not exist |
| 50025 | The trading pair is currently unavailable |
| 50026 | The trading pair is currently unavailable |
| 50027 | The trading pair is suspended for maintenance |
| 50028 | The trading pair is removed |
| 50029 | The trading pair has no order price |
| 50030 | The trading pair will soon be available |
| 50031 | System error |
| 50032 | The currency does not exist |
| 50033 | The topic of the websocket query does not exist |
| 50034 | The borrowing amount must be over 0.00000001 |
| 50035 | The maximum borrowing amount is exceeded |
| 50036 | The loan configuration does not exist |
| 50037 | This currency cannot be borrowed |
| 50038 | The system limit is exceeded |
| 50039 | The currency and the trading pair do not match |
| 50040 | The repayment amount must be more than 0 |
| 50041 | The repayment amount must be less than your available balance |
| 50042 | The repayment amount must be more than the interest |
| 50043 | Unknown transaction type |
| 50044 | The system account is not found |
| 50045 | Insufficient locked asset |
| 50046 | The price is too low |
| 50047 | The price is too high |
| 50048 | The maximum number of orders is exceeded |
| 50049 | The request body of the system user is empty |
| 50050 | The system loan collection has been done |
| 50051 | The user in reconciliation is not in the system (cache) |
| 50052 | The asset balance will be less than 0 after transferring |
| 50053 | The amount is less than 0 when making loan repayment |
| 50054 | The amount is less than 0 when making interest repayment |
| 50055 | The amount is less than 0 when paying trading fees |
| 50056 | The amount is less than 0 when paying liquidation fees |
| 50057 | The amount is less than 0 when paying the excessive loss resulted from liquidation |
| 50058 | After the profit is used to cover the excessive loss resulted from liquidation, the balance will be less than 0 |
| 50059 | This currency cannot be transferred |
| 50060 | Duplicated clientOid |
| 50061 | There is a problem with the parameter you requested |
| 50062 | The order status is cancelled or fullFill |
| 50063 | Token precision must less than or equal to eight |
| 50064 | Your account is temporarily frozen. Please contact customer support if you have any questions |
| 50065 | symbol_off_shelf |
| 50066 | Position closing, please try again later |
| 50068 | {0} selling restriction: currently, you can sell {2} worth {1} USDT |
| 50077 | Can be convert {1} times every {0} hours |
| 50078 | The amount you can withdraw is {0} |
| 50081 | Exceeds the 24-hour net selling limit of {0}; currently, you can sell {2} worth {1} USDT |
| 59002 | Insufficient product balance |
| 59003 | This product is not available for purchase yet |
| 59005 | KYC verification not performed |
| 59006 | The country where KYC is located cannot apply for subscription |
| 59007 | Minimum limit for single currency subscription |
| 59008 | Maximum single currency subscription limit |
| 59009 | The subscription amount does not meet the step size verification |
| 59010 | The precision of the subscription amount cannot exceed {0} digits |
| 59011 | Insufficient balance |
| 59013 | Parameter exception: {0} |
| 59016 | The total position of a single person is exceeded |
| 59019 | The subscription time range is {0} ~ {1} |
| 59020 | Minimum limit for single subscription |
| 59021 | Redemption of the product has been suspended |
| 59022 | Insufficient balance |
| 59023 | Insufficient product remaining quota, remaining {0} |
| 59024 | Amount cannot be empty when redeeming current financial management |
| 59025 | orderId cannot be empty when redeeming regular financial management |
| 59026 | Parameter error |
| 59027 | This product is a novice product. You are not a novice user. Please choose another product. |
| 59029 | Product cannot be subscribe |
| 59030 | Exceeding the max amount for once subscribe |
| 59031 | Cannot perform redemption operation |
| 59033 | Less than redemption minimum limit |
| 59034 | The redemption amount accuracy cannot exceed {0} digits |
| 59035 | The redemption amount must be greater than the minimum limit |
| 59037 | The current order status does not allow operation |
| 59038 | Redemption is not allowed on the day of expiration |
| 59039 | Cannot perform redemption operation |
| 59040 | The redemption time range is {0}-{1} |
| 59041 | The accuracy of the subscription amount is not met |
| 59043 | Insufficient product remaining quota, remaining {0} {1} |
| 59044 | Operations are frequent, please try again later. |
| 59045 | subscription time range is {0}~{1} |
| 59046 | Transaction failed |
| 59047 | redemption time range is {0}-{1} |
| 59048 | fixed redemption not pass amount |
| 59049 | Product does not exist |
| 60001 | StartTime not empty |
| 60002 | MerchantId not empty |
| 60003 | Not found the p2p order |
| 60004 | Not found the p2p advertisement |
| 60005 | Not found the p2p merchant |
| 60006 | Parameter error |
| 60007 | upload image cannot exceed 5M |
| 60008 | The image format must be [". jpg", ". jpeg", ". png"] |
| 60009 | The image format error |
| 60010 | upload error |
| 60011 | Ordinary users can not post ads |
| 60012 | Please change your status from offline to online before posting your ads！ |
| 60013 | Insufficient balance |
| 60014 | Fiat info not found |
| 60015 | Digital currency info not found |
| 60016 | Only supports publish CNY advertisement |
| 60017 | Not support publish CNY advertisement |
| 60018 | Your KYC certification only supports publishing {0} |
| 60019 | Post failed. Unable to obtain preference price |
| 60020 | advertisement type error |
| 60021 | Payment method is empty |
| 60022 | Trading amount incorrect |
| 60023 | Beyond fiat limit ({0}-{1}) |
| 60024 | Abnormality occurred in the P2P merchant fund refund |
| 60025 | The remark length cannot be longer than the configuration length |
| 60026 | Exclusive country error |
| 60027 | Payment time limit error |
| 60028 | Payment method error |
| 60029 | publish advertisement error |
| 60030 | status error |
| 60031 | The advertisement number is too long |
| 60032 | The advertisement not exist |
| 60033 | Posted ad amount incorrect |
| 60034 | Number of images attached in the remark cannot exceed the allocation limit. |
| 60035 | Edit advertisement error |
| 60036 | payTimeLimit cannot be empty |
| 60037 | Post failed. Price is significantly deviated from preference price |
| 60038 | Post failed. Incorrect floating rate |
| 60039 | User does not exist |
| 60040 | Unauthorized access not supported |
| 60041 | Edit advertisement price error |
| 60042 | limitPrice not empty |
| 60043 | The advertisement status update fail |
| 60044 | The advertisement status in editing can be edited |
| 60045 | Exceeding the number of advertisement that can be published |
| 60046 | priceValue not empty |
| 60047 | userPayMethodId not empty |
| 60049 | You are not currently a merchant |
| 70001 | Activity ID not correct |
| 70002 | rankType error |
| 70006 | Parameter value range verification failed: {0} |
| 70008 | Parameter verification failed: {0}, please make sure the time is within 30 days |
| 70020 | Account does not exist |
| 70101 | illegal parameter |
| 70102 | Parameter verification failed-brokerUserId |
| 70103 | Parameter verification failed-startTime |
| 70104 | Parameter verification failed-endTime |
| 70204 | The account has open order, please cancel the open order. |
| 70205 | Today's reset has exceeded the maximum number of resets for the day: {0} and cannot be reset. |
| 70206 | Not main Account |
| 70207 | UID {0} not exist |
| 70208 | {0} can not deposit or withdrawal, please wait. |
| 70209 | Risk control, please contact with CS service. |
| 70210 | Exchange fail, please contact with CS service. |
| 70211 | {0}  balance exceeds {1} USDT |
| 70212 | please less than {0} USDT |
| 70213 | The withdrawal amount exceeds the daily limit |
| 70214 | Restricted assets exist |
| 70215 | Frozen assets exist |
| 70216 | locked assets exist |
| 70217 | The whitelist is turned on, withdraw address is not in addressBook |
| 70218 | The transaction quantity of pending orders is higher than the modified quantity |
| 70219 | Withdrawal exceeds monthly limit |
| 70220 | Insufficient liquidity in the market, please operate later |
| 70221 | The current currency is {0}, the net purchase value is limited to {1} USD, and you can also purchase {3} with a net purchase value of {2} USD. |
| 70222 | The current currency is {0}, the net purchase quantity is limited to {1}, and the net purchase quantity is also {2} |
| 70223 | Exceeding the maximum number of orders for total trading |
| 70224 | This currency has a selling limit of {0}, leaving {1} |
| 70225 | This currency has a buying limit of {0}, leaving {1} |
| 70226 | The current maximum amount of coins that can be withdrawn or transferred out is {0}. If you want to withdraw or transfer all coins, please confirm that all spot orders have been ended. |
| 70227 | The user does not allow to place order |
| 70228 | The operation is too frequent, please try again later. |
| 70229 | Place order error |
| 80001 | illegal params |
| 80002 | system error |
| 80003 | Loan coin not exist |
| 80004 | Place coin not exist |
| 80005 | Place single minimum limit |
| 80006 | Place single Maximum limit |
| 80007 | Loan single minimum limit |
| 80008 | Loan single maximum limit |
| 80009 | Loan pool not enough |
| 80010 | place float exceed |
| 80011 | Order not exist |
| 80012 | Pledge not exist |
| 80013 | Extract exceed maximum limit |
| 80014 | Operate limit amount is {0} USDT |
| 80015 | Order count maximum limit |
| 80016 | Order status illegal |
| 80020 | The minimum number of operations is {0} {1} |
| 90001 | The single subscription limit cannot be exceeded {0} |
| 400171 | Parameter verification failed {0}{1} |
| 400172 | Parameter verification failed |

**Duplicate codes in this table.** `40104` is listed twice with two completely
different messages ("Based on your IP address , …" and "Unable to withdraw to
this account …"); both rows are reproduced above as printed. No other code is
repeated verbatim in the REST table.

## WebSocket error codes

| Error code | Error message |
|------------|---------------|
| 429 | Too Many Requests |
| 25000 | System error, please try again later |
| 25001 | Operation timed out |
| 25002 | Unsupported operation |
| 25003 | Concurrent operation, please retry |
| 25004 | Operation too frequent, please try again later |
| 25005 | User does not exist |
| 25006 | Abnormal account status |
| 25007 | Account in an irregular status |
| 25008 | Account is in forced liquidation status |
| 25009 | Unsupported account mode switch |
| 25010 | Unsupported position mode switch |
| 25011 | Transfer failed, account is in forced liquidation status |
| 25012 | Account at risk, trading temporarily disabled |
| 25013 | {0} not support API trade |
| 25100 | Trading pair {0} does not exist |
| 25101 | Trading pair not open for trading |
| 25102 | Trading pair temporarily closed for maintenance |
| 25104 | Contract delisted |
| 25105 | This contract does not support opening positions |
| 25107 | There is currently a position, please close the position |
| 25108 | The contract is in the initialization state |
| 25110 | This coin is not supported for deposits into the unified account |
| 25200 | {0} validation error |
| 25201 | Currency does not exist |
| 25202 | Insufficient balance |
| 25203 | Insufficient margin |
| 25204 | Order does not exist |
| 25205 | {0} trading price cannot be below {1}% |
| 25206 | {0} trading price cannot exceed {1}% |
| 25207 | {0} trading quantity cannot be less than {1} units |
| 25208 | {0} trading quantity cannot exceed {1} units |
| 25209 | Insufficient market liquidity, please try again later |
| 25210 | Large price fluctuation, placing the order entails higher risk, please reorder |
| 25211 | Exceeds the limit of {0} maximum orders |
| 25212 | Duplicate clientOid |
| 25213 | Exceeds {0} permanent net buy limit, you can currently buy up to {1} USD worth of {0} |
| 25214 | Exceeds {0} permanent net sell limit, you can currently sell up to {1} USD worth of {0} |
| 25215 | Exceeds {0} 24-hour net buy limit, you can currently buy up to {1} USD worth of {0} |
| 25216 | Exceeds {0} 24-hour net sell limit, you can currently sell up to {1} USD worth of {0} |
| 25217 | Exceeds maximum repayment limit |
| 25218 | High risk, usage may result in forced liquidation |
| 25219 | Increase in IMR exceeds available assets |
| 25220 | 未找到描述 |
| 25221 | Level gradient does not exist |
| 25222 | Trade or fair mark price does not exist |
| 25223 | Exceeds Max. leverage |
| 25224 | Take-profit or stop-loss triggered warning, please proceed with cancellation |
| 25225 | Insufficient available quantity in position |
| 25226 | Insufficient total position quantity |
| 25227 | No position available to close |
| 25228 | Unable to update leverage for this position, insufficient margin! |
| 25229 | Total positions exceed the current limit of {0} positions |
| 25230 | Order quantity exceeds the maximum open quantity |
| 25231 | Close quantity cannot exceed the held position quantity |
| 25232 | Reduce-only orders will only reduce your position; please cancel or modify existing orders before placing a new one |
| 25233 | Order quantity cannot exceed the maximum for this level |
| 25234 | Remaining quantity for regular orders is {0} {1}, and for post-only orders it is {2} {3}. |
| 25235 | Due to risk control, the maximum open position currently allowed is {0} {1}. The risk control limit for a single user includes all primary and sub-accounts |
| 25236 | Incorrect position open type |
| 25237 | Close orders can only occur in bi-directional mode |
| 25238 | {0} do not assign values at the same |
| 25239 | Closing failed, please try again later |
| 25240 | {0} does not support this operation |
| 25241 | Bulk orders cannot exceed the corresponding maximum order value. |
| 25242 | The maximum reducible amount is {0}{1}. |
| 25243 | You have exceeded the currency holding limit and cannot add more of this currency. |
| 25244 | Price should be a multiple of {0} |
| 25245 | The account is not the unified account mode |
| 25559 | Not loan user |
| 25560 | Subaccount the same with RiskUnit ID |
| 25561 | SubUid not in risk unit |
| 25562 | The subacccount is the other's Risk Unit |
| 25563 | The UID you are unbinding has a non-zero balance and has unsettled or pending loan orders in its associated risk unit. |
| 25564 | The number of sub-accounts under the risk unit has exceeded the limit. |
| 25565 | The sub-account UID you entered is already bound to another risk unit. |
| 25566 | The risk unit does not exist. |
| 25567 | Exceeded the maximum quantity of contract orders：{0} {1} |
| 25568 | The order does not meet the modification requirements. |
| 25569 | Exceeded the maximum limit for modifications. |
| 25570 | There are pending orders for contract bidirectional closing or contract unidirectional opening/reducing positions. |
| 25571 | The modification price and qty is the same as the original value. Please adjust and try again. |
| 25572 | Too many pending modification requests. Please try again later |
| 25573 | Skipped due to prior modification failure |
| 25574 | Reduce-only order protection |
| 25575 | Failed to stop the strategy because the corresponding strategy ID could not be found |
| 25576 | Failed to stop the strategy because it is already stopping |
| 25577 | Failed to stop the strategy because the corresponding strategy ID could not be found |
| 25578 | No strategies available to stop |
| 25579 | For long position TP/SL (close long), the take-profit trigger price must be greater than the average entry price |
| 25580 | For long position TP/SL (close long), the stop-loss trigger price must be less than the average entry price |
| 25581 | For short position TP/SL (close short), the take-profit trigger price must be less than the average entry price |
| 25582 | For short position TP/SL (close short), the stop-loss trigger price must be greater than the average entry price |
| 25583 | Take-profit price must be greater than 0 |
| 25584 | Stop-loss price must be greater than 0 |
| 25585 | For long position TP/SL (close long), the take-profit trigger price must be greater than the latest price |
| 25586 | For long position TP/SL (close long), the stop-loss trigger price must be less than the latest price |
| 25587 | For short position TP/SL (close short), the take-profit trigger price must be less than the latest price |
| 25588 | For short position TP/SL (close short), the stop-loss trigger price must be greater than the latest price |
| 25589 | For long position TP/SL (close long), the take-profit trigger price must be greater than the mark price |
| 25590 | For long position TP/SL (close long), the stop-loss trigger price must be less than the mark price |
| 25591 | For short position TP/SL (close short), the take-profit trigger price must be less than the mark price |
| 25592 | For short position TP/SL (close short), the stop-loss trigger price must be greater than the mark price |
| 25593 | The current trading type does not support TP/SL settings |
| 25594 | Only one TP/SL can be set for all positions of the current symbol |
| 25595 | The total TP/SL quantity for partial positions exceeds the position amount |
| 25596 | Cannot modify strategy in triggered or error state |
| 25597 | Strategy does not exist or has already been stopped |
| 25598 | Current strategy status does not support modification |
| 25599 | Maximum number of active TP/SL orders for this symbol is {0}; cannot add more |
| 25600 | No changes made to the TP/SL order; please modify before submitting |
| 25601 | Position does not exist; cannot set TP/SL |
| 25602 | Take-profit trigger price must be greater than 0 |
| 25603 | Stop-loss trigger price must be greater than 0 |
| 25604 | Take-profit order price must be greater than 0 |
| 25605 | Stop-loss order price must be greater than 0 |
| 25606 | Take-profit trigger price does not meet precision requirements |
| 25607 | Stop-loss trigger price does not meet precision requirements |
| 25608 | Take-profit order price does not meet precision requirements |
| 25609 | Stop-loss order price does not meet precision requirements |
| 25610 | Order amount does not meet precision requirements |
| 25611 | Order quantity must be greater than the minimum order amount |
| 25612 | Only opening orders are allowed to have preset take-profit and stop-loss |
| 25620 | permission denied |
| 25622 | The collateral setting for institutional loans sub-accounts must be in all-coins mode |
| 25650 | For long positions, the stop-loss price must be lower than the current price: {0} |
| 25651 | For short positions, the take-profit price must be lower than the current price: {0} |
| 25652 | For long positions, the take-profit price must be greater than the current price: {0} |
| 25653 | The order has been changed. Please try again later |
| 25654 | {0} trading price cannot be greater than the bankruptcy price of {1} {2} |
| 25655 | {0} trading price cannot be lower than the bankruptcy price of {1} {2} |
| 40001 | ACCESS_KEY cannot be empty |
| 40002 | SECRET_KEY cannot be empty |
| 40003 | Signature cannot be empty |
| 40006 | Invalid ACCESS_KEY |
| 40008 | Request timestamp expired |
| 40009 | sign signature error |
| 40017 | Parameter verification failed {0} |
| 40034 | Parameter {0} does not exist |
| 40725 | service return an error |
| 43117 | Exceeded Max. transferable quantity |
| 95001 | The current user is undergoing forced liquidation. |
| 95002 | The sub-account has contract positions and cannot be added. |
| 95003 | he sub-account UID you entered does not exist. |
| 95004 | The UID you unbound has a non-zero asset balance and is in a risk unit with unsettled or pending loan orders. |
| 95005 | The LTV for ins loan has exceeded the limit, and opening contracts is prohibited |
| 95006 | The LTV for ins loan has exceeded the limit, and spot buying is prohibited |
| 95007 | Ins loan is not support this spot trading pair. |
| 95008 | Ins loan is not support futures trading. |
| 95009 | Ins loan is not support this margin trading pair. |
| 95010 | Your entered subaccount UID is already bound to another risk unit. |
| 95011 | Parameter validation failed:{0} |
| 95013 | The leverage {1} of the sub-account contract order trading pair {0} exceeds max leverage {2} for ins loan.", |
| 95014 | The sub-account has contract orders and cannot be added |

**Duplicate codes in this table.** None — every code in the WebSocket table is
unique. `25575` and `25577` do carry byte-identical messages
("Failed to stop the strategy because the corresponding strategy ID could not be
found") under two different codes; both rows are reproduced as printed.

## Codes Cachy is most likely to hit

All quotes below are verbatim from the tables above. The selection is drawn
only from codes that actually appear in those two tables.

### Signature and credentials (REST `40001`–`40012`; WebSocket `40001`–`40009`)

| Code | Message | Why it matters |
|------|---------|----------------|
| 40001 | ACCESS_KEY cannot be empty | Header never reached the server — the key itself is missing. |
| 40002 | ACCESS_SIGN cannot be empty | Header never reached the server — the signature is missing. |
| 40002 (WS) | SECRET_KEY cannot be empty | The WebSocket table names this `SECRET_KEY` while REST names the same slot `ACCESS_SIGN`; the header name is not interchangeable. |
| 40003 | Signature cannot be empty | Body-signed requests: `sign` field absent. |
| 40005 | Invalid ACCESS_TIMESTAMP | Timestamp is not an integer or is outside the accepted range. |
| 40006 | Invalid ACCESS_KEY | The key is not recognised by the exchange. |
| 40007 | Invalid Content_Type | The request's `Content-Type` was rejected before the signature was evaluated. |
| 40008 | Request timestamp expired | The signed window elapsed. This is a **clock-skew** failure, not a bad key — it is the code a client sees when its local time drifts past the server's tolerance. |
| 40009 | sign signature error | HMAC mismatch: wrong secret, wrong payload, or a body that was re-serialised after signing. |
| 40010 | Request timed out | Sits inside the signature block but is a transport-level condition, not a credential one. |
| 40011 | ACCESS_PASSPHRASE cannot be empty | Passphrase field absent. |
| 40012 | apikey/password is incorrect | The key/secret combination is rejected. |
| 40018 | Invalid IP | Source IP rejected (proxy / egress-IP drift). |
| 40038 | The current ip is not in the apikey ip whitelist | The single most common self-inflicted failure for a hosted client: the key is valid but the calling IP is not on the key's allow-list. |
| 22010 | Please bind ip whitelist address | The account-level variant of the above. |

### Routing, request shape, and idempotency

| Code | Message | Why it matters |
|------|---------|----------------|
| 429 | Too many requests | HTTP rate limit. Back off; it is the only code here that is expected on a non-2xx status. |
| 40404 | Request URL NOT FOUND | The path is wrong or the product moved to the UTA edition. Fails identically to a genuine business error at the HTTP level. |
| 40402 | orderId or clientOId format error | Identifier shape is wrong. |
| 40304 | clientOid or clientOrderId length cannot greater than 50 | Older endpoint variant: 50-character cap. |
| 40305 | clientOid or clientOrderId length cannot greater than 64, and cannot be Martian characters | Newer endpoint variant: 64-character cap plus a character-class restriction. A 55-character id passes REST `40304`'s cap but fails here, and vice versa depends on which endpoint you call. |
| 40306 | Batch processing orders can only process up to 20 | Batch order ceiling. |
| 40924 | orderId and clientOid must have one | Exactly one of the two identifiers is required, not both and not neither. |
| 40925 | price or size must be passed in together | Modify-order field-pairing rule. |
| 40912 | single cancel cannot exceed 50 | Batch-cancel ceiling. |
| 43118 | clientOrderId duplicate | The idempotency key was reused. |
| 45034 | clientOid duplicate | The same condition reported by the legacy engine under a different code — a retry can surface either. |
| 50060 | Duplicated clientOid | A third code for the same duplicate-id condition, from the margin account. |
| 25212 (WS) | Duplicate clientOid | WebSocket equivalent of the duplicate-id failure. |

### Balance, margin, and position size

| Code | Message | Why it matters |
|------|---------|----------------|
| 40754 | balance not enough | Insufficient available contract balance for the order. |
| 40755 | Not enough open positions are available. | The available (unlocked) balance leg of the same failure. |
| 40756 | The balance lock is insufficient. | The *locked* balance leg. |
| 40757 | Not enough position is available. | Position-side available balance. |
| 40758 | The position lock is insufficient. | Position-side locked balance. |
| 43012 | Insufficient balance | Same condition as `40754`, reported by the order-engine code range. |
| 45002 | Insufficient asset | Legacy engine spelling. |
| 40798 | Insufficient contract account balance | Transfer-time variant. |
| 40800 | Insufficient amount of margin | Not enough margin to add. |
| 25202 (WS) | Insufficient balance | WebSocket spelling. |
| 25203 (WS) | Insufficient margin | WebSocket spelling. |
| 25225 (WS) | Insufficient available quantity in position | WebSocket spelling of `40755`. |
| 22029 | Risk control, you can currently open a maximum position of {0} {1}. The risk control proportion limit for a uid is calculated including all main accounts and sub-accounts. | Account-level open-size cap. Note the cap is aggregated across **main + sub accounts**. |
| 40928 | Risk control, currently your max open size is {0} {1}. The size was calculated with all the main-sub accounts | The same open-size cap reported by the newer engine. `{0}` is the size, `{1}` the unit. |
| 25235 (WS) | Due to risk control, the maximum open position currently allowed is {0} {1}. The risk control limit for a single user includes all primary and sub-accounts | WebSocket spelling of the risk-control size cap. |
| 40762 | The order size is greater than the max open size | Per-order size ceiling. |
| 45120 | size > max can open order size | Per-order size ceiling, legacy engine. |
| 40921 | The order size cannot exceed the maximum size of the positionLevel | Size must respect the instrument's size ladder (`positionLevel`). |
| 43027 | The minimum order value {0} is not met | Order notional floor. |
| 43006 | The order quantity is less than the minimum transaction quantity | Quantity floor, lot-size rule. |
| 43007 | The order quantity is greater than the maximum transaction quantity | Quantity ceiling, lot-size rule. |
| 22038 | Please enter the quantity as an integral multiple of {0} | Quantity must be a whole multiple of the contract lot. |
| 22034 | Less than the minimum order amount | Order-value floor. |
| 40887 | Failed to place the order, the number of single lightning open positions is at most {0} | Single-click market ("flash"/lightning) open-size cap. |
| 40888 | Failed to place an order, the maximum amount of single lightning closing is {0} | Single-click market close-size cap. |
| 40931 | Trigger the risk control of position closing , prohibiting position closing | Risk control is actively blocking the *reduce* side, not just the open side. |
| 40939 | Reducing positions only will decrease your position. Please cancel or modify the original pending order first before placing a new order | Reduce-only conflict with an existing pending order. |

### Price, liquidation price, and TP/SL validation

| Code | Message | Why it matters |
|------|---------|----------------|
| 40820 | The order price for closing a long position is not allowed to be lower than the liquidation price | A close-long limit below the liquidation price is rejected outright. |
| 40821 | The closing order price cannot be higher than the liquidation price | Mirror rejection for closes, long and short. |
| 22006 | limit price > risk price | Limit price outside the risk-control band. |
| 22007 | limit price < risk price | Limit price outside the risk-control band. |
| 22008 | market price > risk price | Market price outside the risk-control band. |
| 22009 | market price < risk price | Market price outside the risk-control band. |
| 40829 | The take profit price of a long position should be greater than the average open price | **Despite the numeric proximity to `40928`, this is a TP-price rule, not a position-size cap.** It is the first of the TP/SL sanity family `40829`–`40836`. |
| 40830 | The take profit price of the long position should be greater than the current price | TP above the current price, long side. |
| 40831 | The short position take profit price should be less than the average open price | TP below the average entry, short side. |
| 40832 | The take profit price of short positions should be less than the current price | TP below the current price, short side. |
| 40833 | The stop loss price of a long position should be less than the average opening price | SL below the average entry, long side. |
| 40834 | The stop loss price of the long position should be less than the current price | SL below the current price, long side. |
| 40835 | The stop loss price of the short position should be greater than the average opening price | SL above the average entry, short side. |
| 40836 | The stop loss price of the short position should be greater than the current price | SL above the current price, short side. |
| 45035 | Price step mismatch | Price is not a multiple of the tick size. |
| 43028 | Please enter an integer multiple of {0} for price | Same rule, trigger-order endpoint. |
| 45060 | TP price of long position > Current price {0} | Legacy spelling of `40830`. |
| 45064 | TP price of long position > order price {0} | TP must also be beyond the order price, not just the current price. |
| 43013 | Take profit price needs> current price | Trigger-order endpoint spelling of the same rule. |
| 43014 | Take profit price needs to be <current price | Short-side TP, trigger endpoint. |
| 43015 | Stop loss price needs to be < current price | Long-side SL, trigger endpoint. |
| 43016 | Stop loss price needs to> current price | Short-side SL, trigger endpoint. |
| 43030 | Take profit order already existed | A TP already exists for this position. |
| 43031 | Stop loss order already existed | An SL already exists for this position. |
| 43024 | Take profit/stop loss in an existing order, please change it after canceling all | An existing order already carries TP/SL. |
| 40890 | The order of stop-profit and stop-loss for this contract has reached the upper limit | Per-symbol TP/SL order-count ceiling. |
| 40889 | The plan order of this contract has reached the upper limit | Per-symbol plan-order ceiling. |
| 25654 (WS) | {0} trading price cannot be greater than the bankruptcy price of {1} {2} | WebSocket bankruptcy-price guard, long/up side. |
| 25655 (WS) | {0} trading price cannot be lower than the bankruptcy price of {1} {2} | WebSocket bankruptcy-price guard, short/down side. |

### Delivery, one-way mode, and ADL

| Code | Message | Why it matters |
|------|---------|----------------|
| 22039 | Limit open position when delivery is approaching. | Delivery countdown blocks **opening a position**. |
| 22040 | Limit open order when delivery is approaching. | Delivery countdown blocks **placing an order**. |
| 22041 | Limit close order when delivery is approaching. | Delivery countdown blocks **closing an order**. The English wording here does not match the Simplified Chinese page, which reads 临近交割，禁止撤单 ("cancelling an order is forbidden") — see *Known defects*. |
| 22042 | When a one-way position is held, trigger order cannot only reduce positions. | In one-way (net) mode a trigger order may not carry reduce-only semantics. Mode-dependent and easy to hit after a position-mode switch. |
| 45021 | When one-way position is held, the order type must also be one-way position type | The same mode constraint on the order `holdSide` itself. |
| 45020 | Liquidation can only occur under two-way positions | Liquidation orders are unsupported in net mode. |
| 22043 | ADL processing，{0} is limit close position | ADL (auto-deleveraging) is active; closing is restricted. |
| 22044 | ADL processing，cannot flash close Position | ADL active; one-click market close is refused. |
| 22067 | ADL processing，forbid operate the symbol:{0} | ADL active for a specific symbol; **all** operation on it is refused. The symbol is passed as `{0}`. |
| 40921 | The order size cannot exceed the maximum size of the positionLevel | (Also listed above; listed here because ADL/close sizing is where it usually bites.) |
| 22045 | Insufficient liquidity in the market, please operate later | Book too thin to fill; the order engine refuses rather than queueing. |

### Ambiguous, generic, and untyped failures

These are the codes that give a client nothing actionable — worth naming up
front because they are the ones that end up as "unknown error" in an app.

| Code | Message | Why it matters |
|------|---------|----------------|
| 40725 | service return an error | Vendor catch-all. Carries no cause. Also present in the WebSocket table, with a second unrelated meaning for `43117`. |
| 40808 | Parameter verification exception {0} | Generic parameter failure with the offending field in `{0}`. |
| 45001 | Unknown error | Explicit vendor catch-all. |
| 50031 | System error | Another explicit catch-all. |
| 80002 | system error | Catch-all, lowercase. |
| 49040 | Unknown Error | Institutional/custody catch-all. |
| 40015 | System is abnormal, please try again later | Server-side fault; safe to retry with backoff. |
| 40200 | Server upgrade, please try again later | Maintenance window. |
| 40844 | This contract is under temporary maintenance | Per-contract maintenance. |
| 40845 | This contract has been removed | The instrument is delisted; retrying is futile. |
| 40309 | The contract has been removed | Same condition, different code range. |
| 40878 | The contract index data is abnormal. In order to avoid causing your loss, please try again later. | Index/settlement feed is bad; the engine refuses rather than trade on it. |
| 45043 | Due to settlement or maintenance reasons, the trade is suspended | Trading halted. |
| 40908 | Concurrent operation failed | Two mutations raced. |
| 45066 | Position closing, please try again later | Position is mid-close; transient. |
| 40859 | This order is being closed and cannot be closed again | Duplicate close on an already-closing order. |
| 43043 | There is no position | TP/SL or close attempted with no position. |
| 40837 | There is no position in this position, so stop-profit and stop-loss orders cannot be made | Same condition, newer engine. |

## Known defects in these tables

Everything below was observed directly in the transcribed text of the two
source pages. Nothing here is inferred about Bitget's backend.

**Duplicated codes**
- REST `40104` appears twice with two unrelated messages: "Based on your IP
  address , it appears that you are located in a country or region where we are
  currently unable to provide services" and "Unable to withdraw to this account
  Please make sure this is a valid and verified account". A client cannot
  disambiguate a geo-block from a withdrawal-account failure on `40104` alone.
- REST `40017` ("Parameter verification failed {0}") is followed, after the
  table ends, by two out-of-order rows `400171` and `400172` whose codes look
  like digit-suffixed continuations of `40017` rather than distinct
  five-digit codes. `400172`'s message is the bare string "Parameter
  verification failed" with no placeholder at all. Transcribed as printed.
- No code is repeated in the WebSocket table. Two distinct codes do carry
  byte-identical messages: `25575` and `25577`, both "Failed to stop the
  strategy because the corresponding strategy ID could not be found".

**Duplicate *messages* under different codes (same condition, several codes)**
- Order-does-not-exist: REST `31007` "Order does not exist", `43001` "The order
  does not exist", `45057` "The order does not exist!" (and WebSocket `25204`
  "Order does not exist").
- No order to cancel: REST `22001` and `31054`, both "No order to cancel";
  `43004` "There is no order to cancel".
- User is not a trader: REST `31001` and `31025`, both "The user is not a
  trader". The Simplified Chinese page gives *different* meanings for these two
  rows (交易员身份已被停用或撤销 for `31025`), so the English duplication is a
  translation defect, not a genuine duplicate.
- Sub-account name already used: REST `40107` and `40108`, both "The
  subaccountName has been used". The Simplified Chinese page distinguishes them
  (昵称已被使用 vs API的备注已已存在) — again an English translation defect.
- Trading pair unavailable: REST `50025` and `50026`, both "The trading pair is
  currently unavailable" (identical in both language editions, so this one may
  be genuine upstream duplication).
- Pending order failed: REST `43002` and `43003`, identical.
- No change in leverage: REST `40814` and `45054`, identical.
- Liquidation via plan order unsupported: REST `40868` and `43017`, identical.
- Duplicate client id: REST `43118` "clientOrderId duplicate", `45034`
  "clientOid duplicate", `50060` "Duplicated clientOid", WebSocket `25212`
  "Duplicate clientOid" — four codes, one condition.

**Truncated or malformed messages**
- REST `31024` ends mid-sentence in a quoted UI path: "The order is not
  completely filled, please go to "Spot trading"-"Current orders" to cancel the
  order and then sell or close the operation!" — the Chinese original says
  *cancel the order and then sell*, so the English drops a step.
- REST `43132` has its placeholder glued to the front of the message with no
  separator: "{0}Insufficient funds". The placeholder appears to have been
  meant as a prefix argument, and is not one.
- REST `60008` renders the file-extension list with a spurious space after each
  dot: `The image format must be [". jpg", ". jpeg", ". png"]`. The
  Simplified Chinese page has `[".jpg", ".jpeg", ".png"]`.
- REST `40000`'s message runs two sentences together with no space:
  "…you do not have access to open positions.Apologies for any inconvenience
  caused!".
- REST `22030` and `22043`/`22044`/`22067` use the full-width comma `，` in an
  otherwise ASCII message.
- REST `46013` uses a full-width comma inside a mixed-width message: "This
  symbol limits the selling amount{0}，Remaining{0}".
- REST `40829`–`40836` alternate between "the take profit price of a long
  position" and "the take profit price of the long position" for what is
  evidently the same rule.
- REST `45052` is misspelled: "Trigger price parameter verification anbormal".
- REST `50023` is misspelled: "Please contact our Customer Support is you have
  any questions."
- REST `12022` and WebSocket `95003` are both missing the leading **T**:
  "**h**e flash quote information has been tampered with" and "**h**e
  sub-account UID you entered does not exist."
- WebSocket `95013` has a stray trailing double quote inside the message:
  "…exceeds max leverage {2} for ins loan.\","
- REST `43045` is truncated mid-word: "The trader is ful".
- REST `43047` contains a literal un-substituted placeholder: "…within **xx**
  minutes after being removed…".

**Untranslated Chinese fragments**
- REST `31053` is a hybrid: "executePrice cannot exceed triggerPrice 的{0}".
- WebSocket `25220` is entirely untranslated: "未找到描述" ("no description
  found"), i.e. the vendor has no message for that code.
- Full-width punctuation remains in REST `22030`, `22043`, `22044`, `22067`,
  `46013` and `60012` ("…posting your ads！").

**Codes in the `40000` family that look misattributed**
- `40000` is the *first* entry of the credential block but its message is a
  jurisdictional/geo-blocking notice naming Mainland China — not a
  credential condition at all. It reads as a policy code filed into the
  authentication range.
- `40010` "Request timed out" and `40015` "System is abnormal, please try again
  later" are transport/server conditions sitting inside the signature block
  alongside `40009` "sign signature error".
- `40078` reads "Timestamp for this request is outside of the **ME**
  receiveWindow." — "ME" is not a Bitget header name; the Bitget timestamp
  header is `ACCESS-TIMESTAMP` (as used by `40005` and `40008`). This row
  appears to be carried over from a different vendor's wording.
- `40017`, `40019`, `40020`, `40034`, `40053`–`40059` and `40064` are
  generic field-validation rows inside a range otherwise reserved for
  credentials and account state.
- `40054` "The data fetched by {0} is empty" and `40055`/`40056`/`40070`/`40071`
  (sub-account `subName`, `remark`, `passphrase` rules) are sub-account
  administration rules, not signature rules.

**Structural / coverage defects**
- The English REST table is **not a superset** of the Simplified Chinese one for
  the same page. Codes present in the Chinese table and **absent** from the
  English table as crawled include `13211`, `40017` (second row),
  `40030`, `40062`, `40088`, `40938`, `41113`, `41114`, `43006` (a *different*
  message), `43015`, `43080`, `43115`, `43119`, `43120`, `45015`, `45016`,
  `45054`, `45063`, `45068`, `49012`, `50005`, `59070` and a second `80010`.
  Both tables are reproduced here as crawled; the English table is therefore
  known to be incomplete relative to the vendor's own Chinese edition.
- Several ranges are sparse with unexplained gaps (`22030`–`22034`, `22046`–
  `22066`, `31057`–`40000`, `40086`–`40100`, `40767`–`40774`, `40849`,
  `40881`–`40886`, `40932`–`40935`, `45125`–`45126`, `46014`–`47000`). The
  table gives no legend for the gaps.
- Cross-table code collisions: `40001`, `40002`, `40003`, `40006`, `40008`,
  `40009`, `40017` and `40034` appear in **both** tables, but `40002` has two
  different messages — REST "ACCESS_SIGN cannot be empty" vs WebSocket
  "SECRET_KEY cannot be empty". `40725` and `43117` also appear in both with
  different meanings (`43117` is "Exceeds the maximum amount that can be
  transferred" in REST and "Exceeded Max. transferable quantity" in
  WebSocket).
- `25220` ("未找到描述") shows the WebSocket table has at least one code with no
  authored message, so message-based classification will hit a dead end there.

---

**For:** Cachy App - Trade Execution Integration
**File:** `docs/bitget-api/08_error_codes.md`
