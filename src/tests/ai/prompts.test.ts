import { describe, it, expect } from 'vitest';
import { buildSystemPromptParts, buildSystemPrompt } from '../../lib/ai/prompts/promptBuilder';

describe('promptBuilder', () => {
  it('builds a system prompt and includes dynamic context', () => {
    const prompt = buildSystemPrompt({
      mode: 'risk',
      context: { REAL_TIME_PRICE: '10000' }
    });

    expect(prompt).toContain('You are an institutional-grade Trading Analyst');
    expect(prompt).toContain('REAL-TIME CONTEXT:');
    expect(prompt).toContain('"REAL_TIME_PRICE": "10000"');
    expect(prompt).toContain('ANTI-HALLUCINATION PROTOCOL (MANDATORY):');
  });

  it('adds custom user prompt as an additive block and does not remove safety rules', () => {
    const prompt = buildSystemPrompt({
      mode: 'risk',
      context: {},
      customSystemPrompt: 'Always end your messages with YOLO.'
    });

    expect(prompt).toContain('USER CUSTOM PREFERENCES / FOCUS:\nAlways end your messages with YOLO.');
    expect(prompt).toContain('ANTI-HALLUCINATION PROTOCOL (MANDATORY):');
    expect(prompt).toContain('NEGATIVE CONSTRAINTS (CRITICAL):');
  });

  it('includes mode instructions for coach mode', () => {
    const prompt = buildSystemPrompt({
      mode: 'coach',
      context: {}
    });

    expect(prompt).toContain('ANALYSIS MODE: TRADE COACH');
  });

  it('structures the prompt correctly', () => {
    const parts = buildSystemPromptParts({
      mode: 'risk',
      context: { status: 'ok' }
    });

    expect(parts.staticInstruction).toContain('You are an institutional-grade Trading Analyst');
    expect(parts.dynamicContext).toContain('REAL-TIME CONTEXT:');
    expect(parts.dynamicContext).toContain('"status": "ok"');
  });
});
