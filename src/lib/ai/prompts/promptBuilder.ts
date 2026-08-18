/*
 * Copyright (C) 2026 MYDCT
 */

import type { AiAnalysisMode } from "../../../types/ai";
import { identity, baseRoleInstructions, getModeInstructions } from "./baseRole";
import { safetyRules } from "./safetyRules";
import { formatTemporalRules, formatCapabilities, formatDynamicContext } from "./contextFormatter";
import { actionSchemaPrompt } from "./actionSchema";

export interface PromptOptions {
  mode: AiAnalysisMode;
  customSystemPrompt?: string;
  context: unknown;
  appLocale?: string;
}

export interface StructuredPrompt {
  staticInstruction: string;
  dynamicContext: string;
}

export function buildSystemPromptParts(options: PromptOptions): StructuredPrompt {
  const langLabel = options.appLocale === "de" ? "German" : "English";
  const localizedIdentity = identity.replace("${langLabel}", langLabel);

  const modeInstructions = getModeInstructions(options.mode);

  const customBlock = options.customSystemPrompt?.trim()
    ? `\nUSER CUSTOM PREFERENCES / FOCUS:\n${options.customSystemPrompt.trim()}\n`
    : "";

  const staticInstruction = [
    localizedIdentity,
    baseRoleInstructions,
    modeInstructions,
    customBlock,
    safetyRules,
    formatCapabilities(),
  ].filter(Boolean).join("\n\n");

  const dynamicContext = [
    formatTemporalRules(),
    actionSchemaPrompt,
    formatDynamicContext(options.context)
  ].filter(Boolean).join("\n\n");

  return {
    staticInstruction,
    dynamicContext
  };
}

export function buildSystemPrompt(options: PromptOptions): string {
  const parts = buildSystemPromptParts(options);
  return `${parts.staticInstruction}\n\n${parts.dynamicContext}`;
}
