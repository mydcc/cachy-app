interface CryptoKey {}
const cryptoService = {
  encrypt(plaintext: string, password?: string | CryptoKey) {}
};
let encryptionPassword: Parameters<typeof cryptoService.encrypt>[1] = undefined;
encryptionPassword = "test";
const key: CryptoKey = {};
encryptionPassword = key;
