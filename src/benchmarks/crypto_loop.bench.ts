
import { describe, beforeAll, test, vi } from 'vitest';
import { cryptoService, type EncryptedBlob } from '../services/cryptoService';

// cryptoService reads `browser` from $app/env, not from a global. The window
// polyfill below therefore never reaches the check that matters: without this
// mock, encrypt() throws 'CryptoService requires generic Web Crypto API
// (Secure Context)' and the benchmarks are skipped instead of measured.
vi.mock('$app/env', () => ({ browser: true }));

// Ensure crypto is available in Node environment
if (typeof window === 'undefined') {
    (global as unknown as { window: unknown }).window = {
        crypto: globalThis.crypto,
        TextEncoder: globalThis.TextEncoder,
        TextDecoder: globalThis.TextDecoder,
        atob: (str: string) => Buffer.from(str, 'base64').toString('binary'),
        btoa: (str: string) => Buffer.from(str, 'binary').toString('base64'),
    };
    (global as unknown as { browser: boolean }).browser = true;
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

    test('Sequential Encryption (Obfuscation Mode)', async ({ bench }) => {
      await bench('Sequential Encryption (Obfuscation Mode)', async () => {
        const secrets: Record<string, EncryptedBlob> = {};
        for (const key of SENSITIVE_KEYS) {
            const value = values[key];
            if (value) {
                secrets[key] = await cryptoService.encrypt(value, deviceKey);
            }
        }
      }).run();
    });

    test('Parallel Encryption (Obfuscation Mode)', async ({ bench }) => {
      await bench('Parallel Encryption (Obfuscation Mode)', async () => {
        const secrets: Record<string, EncryptedBlob> = {};
        await Promise.all(SENSITIVE_KEYS.map(async (key) => {
            const value = values[key];
            if (value) {
                secrets[key] = await cryptoService.encrypt(value, deviceKey);
            }
        }));
      }).run();
    });

    test('Sequential Decryption (Obfuscation Mode)', async ({ bench }) => {
      await bench('Sequential Decryption (Obfuscation Mode)', async () => {
        const decrypted: Record<string, string> = {};
        for (const [key, blob] of Object.entries(encryptedSecrets)) {
            decrypted[key] = await cryptoService.decrypt(blob, deviceKey);
        }
      }).run();
    });

    test('Parallel Decryption (Obfuscation Mode)', async ({ bench }) => {
      await bench('Parallel Decryption (Obfuscation Mode)', async () => {
        const decrypted: Record<string, string> = {};
        await Promise.all(Object.entries(encryptedSecrets).map(async ([key, blob]) => {
            decrypted[key] = await cryptoService.decrypt(blob, deviceKey);
        }));
      }).run();
    });
});
