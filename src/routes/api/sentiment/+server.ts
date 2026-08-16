/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { checkClientToken } from '../../../lib/server/clientToken';

interface SentimentOutput {
    score: number;
    regime: string;
    summary: string;
    keyFactors: string[];
}

function calculateHeuristicSentiment(headlines: string[]): SentimentOutput {
    const positiveWords = [
        'surge', 'soar', 'bull', 'gain', 'jump', 'rally', 'high', 'breakout',
        'record', 'green', 'inflow', 'profit', 'boost', 'up', 'climb', 'accumulate', 'adoption'
    ];
    const negativeWords = [
        'crash', 'plunge', 'bear', 'drop', 'dump', 'fall', 'hack', 'ban',
        'lawsuit', 'sec', 'liquidation', 'outflow', 'loss', 'down', 'sink', 'fud', 'scam', 'drop'
    ];

    let posCount = 0;
    let negCount = 0;

    for (const h of headlines) {
        const lower = h.toLowerCase();
        for (const w of positiveWords) {
            if (lower.includes(w)) posCount++;
        }
        for (const w of negativeWords) {
            if (lower.includes(w)) negCount++;
        }
    }

    const total = posCount + negCount;
    let score = 0;
    let regime: string;

    if (total > 0) {
        score = Math.round(((posCount - negCount) / (total + 2)) * 100) / 100;
    }

    if (score >= 0.25) regime = 'BULLISH';
    else if (score <= -0.25) regime = 'BEARISH';
    else if (total === 0) regime = 'UNCERTAIN';
    else regime = 'NEUTRAL';

    return {
        score,
        regime,
        summary: `Heuristic market sentiment (${headlines.length} news items analyzed). AI service currently busy.`,
        keyFactors: posCount > negCount
            ? ['Positive market momentum', 'Headline keyword signals']
            : negCount > posCount
            ? ['Downward price pressure signals', 'Cautionary headline signals']
            : ['Mixed market signals'],
    };
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
    const authError = checkClientToken(request, getClientAddress());
    if (authError) return authError;

    try {
        const { headlines, provider, model, apiKey } = await request.json();
        if (!Array.isArray(headlines) || headlines.length === 0) {
            return json({ error: 'NO_HEADLINES' }, { status: 400 });
        }
        if (!provider || (provider !== 'openai' && provider !== 'gemini')) {
            return json({ error: 'INVALID_PROVIDER' }, { status: 400 });
        }
        const prompt = `Analyze sentiment for these headlines. score -1 to 1. regime: BULLISH, BEARISH, NEUTRAL, UNCERTAIN.\n\n${headlines.map((h: string) => '- ' + h).join('\n')}\n\nOutput JSON ONLY: { "score": number, "regime": "string", "summary": "string", "keyFactors": ["string"] }`;

        let resultText = '';
        if (provider === 'openai') {
            if (!apiKey) return json({ error: 'NO_OPENAI_KEY' }, { status: 401 });

            const OpenAI = (await import('openai')).default;
            const openai = new OpenAI({ apiKey });

            const openaiModels = Array.from(new Set([
                model,
                'gpt-4o-mini',
                'gpt-4o'
            ].filter(Boolean)));

            let lastOpenAiErr: unknown = null;
            for (const m of openaiModels) {
                try {
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { role: 'system', content: 'Analyze sentiment.' },
                            { role: 'user', content: prompt },
                        ],
                        model: m,
                        response_format: { type: 'json_object' },
                    });
                    resultText = completion.choices[0].message.content || '';
                    if (resultText) break;
                } catch (err: unknown) {
                    lastOpenAiErr = err;
                    const msg = err instanceof Error ? err.message : String(err);
                    if (msg.includes('401') || msg.includes('Incorrect API key')) {
                        throw err;
                    }
                    console.warn(`[Sentiment API] OpenAI model ${m} failed (${msg.slice(0, 100)}), trying fallback...`);
                }
            }

            if (!resultText && lastOpenAiErr) {
                console.warn('[Sentiment API] All OpenAI models failed, falling back to heuristic sentiment.');
                return json({ analysis: calculateHeuristicSentiment(headlines), isFallback: true });
            }
        } else if (provider === 'gemini') {
            if (!apiKey) return json({ error: 'NO_GEMINI_KEY' }, { status: 401 });

            const { GoogleGenerativeAI } = await import('@google/generative-ai');
            const genAI = new GoogleGenerativeAI(apiKey);

            const geminiModels = Array.from(new Set([
                model,
                'gemini-2.5-flash',
                'gemini-2.0-flash',
                'gemini-1.5-flash-latest',
                'gemini-1.5-flash',
                'gemini-1.5-pro'
            ].filter(Boolean)));

            let lastGeminiErr: unknown = null;
            for (const m of geminiModels) {
                try {
                    const geminiModel = genAI.getGenerativeModel({ model: m });
                    const result = await geminiModel.generateContent(prompt);
                    resultText = result.response.text();
                    if (resultText) break;
                } catch (err: unknown) {
                    lastGeminiErr = err;
                    const msg = err instanceof Error ? err.message : String(err);
                    if (msg.includes('API_KEY_INVALID') || msg.includes('401') || msg.includes('403')) {
                        throw err;
                    }
                    console.warn(`[Sentiment API] Gemini model ${m} unavailable (${msg.slice(0, 120)}), trying fallback model...`);
                }
            }

            if (!resultText && lastGeminiErr) {
                console.warn('[Sentiment API] All Gemini models unavailable, falling back to heuristic sentiment.');
                return json({ analysis: calculateHeuristicSentiment(headlines), isFallback: true });
            }
        }

        if (!resultText) {
            return json({ analysis: calculateHeuristicSentiment(headlines), isFallback: true });
        }

        try {
            const cleaned = resultText.replace(/```json/gi, '').replace(/```/g, '').trim();
            const analysis = JSON.parse(cleaned);
            return json({ analysis });
        } catch {
            return json({ analysis: calculateHeuristicSentiment(headlines), isFallback: true });
        }
    } catch (e: unknown) {
        console.error('Sentiment API Error:', e);
        let message = 'INTERNAL_ERROR';
        if (e instanceof Error) {
            message = e.message;
        } else if (typeof e === 'string') {
            message = e;
        } else if (typeof e === 'object' && e !== null && 'message' in e) {
            message = String((e as { message: unknown }).message);
        }
        return json({ error: message }, { status: 500 });
    }
};
