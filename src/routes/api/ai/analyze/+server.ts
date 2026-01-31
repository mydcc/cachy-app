/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { json } from '@sveltejs/kit';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

export async function POST({ request }) {
    try {
        const { provider, apiKey, model, prompt } = await request.json();

        if (!apiKey) {
            return json({ error: 'Missing API Key' }, { status: 400 });
        }

        let resultText = '';

        if (provider === 'gemini') {
            const genAI = new GoogleGenerativeAI(apiKey);
            const aiModel = genAI.getGenerativeModel({ model: model || 'gemini-1.5-flash' });
            const result = await aiModel.generateContent(prompt);
            resultText = result.response.text();
        } else if (provider === 'openai') {
            const openai = new OpenAI({ apiKey });
            const completion = await openai.chat.completions.create({
                messages: [
                    { role: 'system', content: 'Analyze sentiment.' },
                    { role: 'user', content: prompt }
                ],
                model: model || 'gpt-4o',
                response_format: { type: 'json_object' }
            });
            resultText = completion.choices[0].message.content || '{}';
        } else {
            return json({ error: 'Invalid provider' }, { status: 400 });
        }

        return json({ result: resultText });
    } catch (e: any) {
        console.error("[AI Server] Error:", e);
        return json({ error: e.message || 'AI Error' }, { status: 500 });
    }
}
