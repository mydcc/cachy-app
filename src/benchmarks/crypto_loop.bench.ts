/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */


import { bench, describe, vi, beforeAll } from 'vitest';
import { cryptoService, type EncryptedBlob } from '../services/cryptoService';

// Ensure crypto is available in Node environment
if (typeof window === 'undefined') {
    (global as any).window = {
        crypto: globalThis.crypto,
        TextEncoder: globalThis.TextEncoder,
        TextDecoder: globalThis.TextDecoder,
        atob: (str: string) => Buffer.from(str, 'base64').toString('binary'),
        btoa: (str: string) => Buffer.from(str, 'binary').toString('base64'),
    };
    (global as any).browser = true;
}

const SENSITIVE_KEYS = [
  "openaiApiKey",
  "geminiApiKey",
  "anthropicApiKey",
  "discordBotToken",
  "newsApiKey",
  "cryptoPanicApiKey",
  "cmcApiKey",
  "imgbbApiKey",
  "appAccessToken",
];

const values: Record<string, string> = {};
SENSITIVE_KEYS.forEach(key => {
    values[key] = "some-api-key-value-" + key;
});

describe('Crypto Loop Performance', () => {
    let deviceKey: CryptoKey;
    let encryptedSecrets: Record<string, EncryptedBlob> = {};

    beforeAll(async () => {
        // We need a device key (PBKDF2)
        const randomData = new Uint8Array(32);
        deviceKey = await crypto.subtle.importKey(
            "raw",
            randomData,
            "PBKDF2",
            false,
            ["deriveKey"]
        );

        // Pre-encrypt some secrets for decryption benchmark
        for (const key of SENSITIVE_KEYS) {
            encryptedSecrets[key] = await cryptoService.encrypt(values[key], deviceKey);
        }
    });

    bench('Sequential Encryption (Obfuscation Mode)', async () => {
        const secrets: Record<string, EncryptedBlob> = {};
        for (const key of SENSITIVE_KEYS) {
            const value = values[key];
            if (value) {
                secrets[key] = await cryptoService.encrypt(value, deviceKey);
            }
        }
    });

    bench('Parallel Encryption (Obfuscation Mode)', async () => {
        const secrets: Record<string, EncryptedBlob> = {};
        await Promise.all(SENSITIVE_KEYS.map(async (key) => {
            const value = values[key];
            if (value) {
                secrets[key] = await cryptoService.encrypt(value, deviceKey);
            }
        }));
    });

    bench('Sequential Decryption (Obfuscation Mode)', async () => {
        const decrypted: Record<string, string> = {};
        for (const [key, blob] of Object.entries(encryptedSecrets)) {
            decrypted[key] = await cryptoService.decrypt(blob, deviceKey);
        }
    });

    bench('Parallel Decryption (Obfuscation Mode)', async () => {
        const decrypted: Record<string, string> = {};
        await Promise.all(Object.entries(encryptedSecrets).map(async ([key, blob]) => {
            decrypted[key] = await cryptoService.decrypt(blob, deviceKey);
        }));
    });
});
