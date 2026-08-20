/*
 * Copyright (C) 2026 MYDCT
 */

export const actionSchemaPrompt = [
  "FORMAT: To update values, output a JSON block at the very end:",
  "```json",
  "[",
  '  { "action": "setTradeType", "value": "short" },',
  '  { "action": "setSymbol", "value": "BTCUSDT" },',
  '  { "action": "setEntryPrice", "value": 50000 },',
  '  { "action": "setStopLoss", "value": 49000 },',
  '  { "action": "addTakeProfit", "value": 52000, "percent": 50 },',
  '  { "action": "setTakeProfit", "index": 0, "value": 52000, "percent": 50 },',
  '  { "action": "removeTakeProfit", "index": 1 },',
  '  { "action": "setAutoPrice", "value": false },',
  '  { "action": "setNotes", "value": "Short due to bearish divergence" }',
  "]",
  "```",
  "Supported Actions: setSymbol, setEntryPrice, setStopLoss, setTakeProfit, addTakeProfit, removeTakeProfit, setTradeType, setRisk, setLeverage, setAtrMultiplier, setAtrMode, setAtrTimeframe, setAnalysisTimeframe, setAutoPrice, setAccountSize, setUseAtrSl, resetSetup, setNotes, setTags."
].join("\n");

export const executeTradeActionsTool = {
  type: "function",
  function: {
    name: "execute_trade_actions",
    description: "Executes a sequence of trading actions to set up a trade or modify the interface based on user request and market context.",
    parameters: {
      type: "object",
      properties: {
        actions: {
          type: "array",
          description: "An array of action objects to execute.",
          items: {
            type: "object",
            properties: {
              action: {
                type: "string",
                description: "The name of the action to execute.",
                enum: [
                  "setSymbol", "setEntryPrice", "setStopLoss", "setTakeProfit",
                  "addTakeProfit", "removeTakeProfit", "setTradeType", "setRisk",
                  "setLeverage", "setAtrMultiplier", "setAtrMode", "setAtrTimeframe",
                  "setAnalysisTimeframe", "setAutoPrice", "setAccountSize", "setUseAtrSl",
                  "resetSetup", "setNotes", "setTags"
                ]
              },
              value: {
                type: ["string", "number", "boolean", "array"],
                description: "The value to set or apply. Type varies depending on the action."
              },
              index: {
                type: "number",
                description: "The index of the item to modify or remove. Used for setTakeProfit and removeTakeProfit."
              },
              percent: {
                type: "number",
                description: "The percentage for take profit. Used for addTakeProfit and setTakeProfit."
              }
            },
            required: ["action"]
          }
        }
      },
      required: ["actions"]
    }
  }
};
