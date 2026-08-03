import 'fake-indexeddb/auto';
import { vi } from 'vitest';
import { webcrypto } from 'node:crypto';

// Polyfill Web Crypto API
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
  vi.stubGlobal('crypto', webcrypto);
}
if (typeof window !== 'undefined' && (!window.crypto || !window.crypto.subtle)) {
  Object.defineProperty(window, 'crypto', {
    value: webcrypto,
    writable: true,
    configurable: true
  });
}

// Polyfill localStorage / sessionStorage using happy-dom or a proper proxy
const createStorageMock = () => {
  let store: Record<string, string> = {};
  
  const mock = {
    getItem: vi.fn((key: string) => (key in store ? store[key] : null)),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    })
  };

  return new Proxy(mock, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get(target: any, prop: string | symbol) {
      if (prop in target) return target[prop];
      if (typeof prop === 'string' && prop in store) return store[prop];
      return undefined;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    set(target: any, prop: string | symbol, value: any) {
      if (prop in target) return false;
      if (typeof prop === 'string') store[prop] = value.toString();
      return true;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deleteProperty(target: any, prop: string | symbol) {
      if (prop in target) return false;
      if (typeof prop === 'string') delete store[prop];
      return true;
    },
    ownKeys() {
      return Object.keys(store);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getOwnPropertyDescriptor(target: any, prop: string | symbol) {
      if (typeof prop === 'string' && prop in store) {
        return { enumerable: true, configurable: true, value: store[prop] };
      }
      return undefined;
    }
  });
};

const lsMock = createStorageMock();
const ssMock = createStorageMock();

vi.stubGlobal('localStorage', lsMock);
vi.stubGlobal('sessionStorage', ssMock);

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', { value: lsMock, writable: true, configurable: true });
  Object.defineProperty(window, 'sessionStorage', { value: ssMock, writable: true, configurable: true });
}
if (typeof window !== 'undefined' && !window.indexedDB) { Object.defineProperty(window, 'indexedDB', { value: globalThis.indexedDB, writable: true, configurable: true }); }
