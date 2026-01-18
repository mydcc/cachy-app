import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, decryptLegacy } from './cryptoService';
import CryptoJS from 'crypto-js';

describe('CryptoService (Native + Legacy)', () => {
    const PASSWORD = 'strong-password-123';
    const PLAINTEXT = 'Hello, World! This is a secret message.';

    // Simulation of what the "Old" service would produce (using CryptoJS directly with default SHA1)
    const createV3LegacyBackup = (text: string, pwd: string) => {
        const salt = CryptoJS.lib.WordArray.random(128 / 8);
        const key = CryptoJS.PBKDF2(pwd, salt, {
            keySize: 256 / 32,
            iterations: 600000, // STRONG_ITERATIONS
        });
        const iv = CryptoJS.lib.WordArray.random(128 / 8);
        const encrypted = CryptoJS.AES.encrypt(text, key, {
            iv: iv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7,
        });
        return {
            ciphertext: encrypted.ciphertext.toString(CryptoJS.enc.Base64),
            salt: salt.toString(CryptoJS.enc.Base64),
            iv: iv.toString(CryptoJS.enc.Base64),
        };
    };

    it('should encrypt and decrypt correctly using Native API (New Standard)', async () => {
        const result = await encrypt(PLAINTEXT, PASSWORD);

        expect(result.ciphertext).toBeDefined();
        expect(result.salt).toBeDefined();
        expect(result.iv).toBeDefined();

        const decrypted = await decrypt(result.ciphertext, PASSWORD, result.salt, result.iv);
        expect(decrypted).toBe(PLAINTEXT);
    });

    it('should decrypt Legacy V3 backups (SHA-1 PBKDF2)', async () => {
        // Create a backup using the "Old" format (SHA1)
        const legacy = createV3LegacyBackup(PLAINTEXT, PASSWORD);

        // Decrypt using the NEW service (which should try SHA-256 then fall back to SHA-1)
        const decrypted = await decrypt(legacy.ciphertext, PASSWORD, legacy.salt, legacy.iv);
        expect(decrypted).toBe(PLAINTEXT);
    });

    it('should fail with wrong password', async () => {
        const result = await encrypt(PLAINTEXT, PASSWORD);
        await expect(decrypt(result.ciphertext, 'wrong-password', result.salt, result.iv))
            .rejects.toThrow();
    });

    it('should decrypt Legacy V2 (Weak) backups via decryptLegacy', async () => {
        // Legacy V2 just used password as key (OpenSSL style)
        const encrypted = CryptoJS.AES.encrypt(PLAINTEXT, PASSWORD).toString();

        const decrypted = await decryptLegacy(encrypted, PASSWORD);
        expect(decrypted).toBe(PLAINTEXT);
    });
});
