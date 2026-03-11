
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
        const keysWithValues = SENSITIVE_KEYS.filter(key => values[key]);
        const promises = keysWithValues.map(key => cryptoService.encrypt(values[key], deviceKey));
        const results = await Promise.all(promises);
        for (let i = 0; i < keysWithValues.length; i++) {
            secrets[keysWithValues[i]] = results[i];
        }
    });

    bench('Sequential Decryption (Obfuscation Mode)', async () => {
        const decrypted: Record<string, string> = {};
        for (const [key, blob] of Object.entries(encryptedSecrets)) {
            decrypted[key] = await cryptoService.decrypt(blob, deviceKey);
        }
    });

    bench('Parallel Decryption (Obfuscation Mode)', async () => {
        const decrypted: Record<string, string> = {};
        const entries = Object.entries(encryptedSecrets);
        const promises = entries.map(([_, blob]) => cryptoService.decrypt(blob, deviceKey));
        const results = await Promise.all(promises);
        for (let i = 0; i < entries.length; i++) {
            decrypted[entries[i][0]] = results[i];
        }
    });
});
