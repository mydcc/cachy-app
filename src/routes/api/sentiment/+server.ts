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
            const completion = await openai.chat.completions.create({
                messages: [
                    { role: 'system', content: 'Analyze sentiment.' },
                    { role: 'user', content: prompt },
                ],
                model: model || 'gpt-4o',
                response_format: { type: 'json_object' },
            });
            resultText = completion.choices[0].message.content || '{}';
        } else if (provider === 'gemini') {
            if (!apiKey) return json({ error: 'NO_GEMINI_KEY' }, { status: 401 });

            const { GoogleGenerativeAI } = await import('@google/generative-ai');
            const genAI = new GoogleGenerativeAI(apiKey);
            const geminiModel = genAI.getGenerativeModel({ model: model || 'gemini-1.5-flash-latest' });
            const result = await geminiModel.generateContent(prompt);
            resultText = result.response.text();
        }
        if (!resultText) return json({ error: 'NO_RESULT' }, { status: 500 });
        const analysis = JSON.parse(resultText.replace(/```json/g, '').replace(/```/g, '').trim());
        return json({ analysis });
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
