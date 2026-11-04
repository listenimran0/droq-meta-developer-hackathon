/**
 * Hermes has no WebCrypto.subtle — Supabase PKCE then falls back to "plain"
 * and Google OAuth exchange breaks. Polyfill before any auth code runs.
 */
import 'react-native-get-random-values';
import * as ExpoCrypto from 'expo-crypto';

function toUint8Array(data: ArrayBufferView | ArrayBuffer): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

async function digest(
  algorithm: AlgorithmIdentifier,
  data: ArrayBufferView | ArrayBuffer,
): Promise<ArrayBuffer> {
  const name =
    typeof algorithm === 'string'
      ? algorithm
      : ((algorithm as { name?: string }).name ?? '');
  const normalized = name.toUpperCase();

  let algo: ExpoCrypto.CryptoDigestAlgorithm;
  switch (normalized) {
    case 'SHA-256':
      algo = ExpoCrypto.CryptoDigestAlgorithm.SHA256;
      break;
    case 'SHA-384':
      algo = ExpoCrypto.CryptoDigestAlgorithm.SHA384;
      break;
    case 'SHA-512':
      algo = ExpoCrypto.CryptoDigestAlgorithm.SHA512;
      break;
    default:
      throw new Error(`Unsupported digest algorithm: ${name}`);
  }

  // expo-crypto accepts TypedArray; cast keeps TS happy across RN buffer types
  return ExpoCrypto.digest(algo, toUint8Array(data) as never);
}

const g = globalThis as typeof globalThis & { crypto?: Crypto };

if (!g.crypto) {
  g.crypto = {
    getRandomValues: ExpoCrypto.getRandomValues as Crypto['getRandomValues'],
    randomUUID: ExpoCrypto.randomUUID as Crypto['randomUUID'],
    subtle: { digest } as SubtleCrypto,
  } as Crypto;
} else {
  if (!g.crypto.subtle) {
    Object.defineProperty(g.crypto, 'subtle', {
      value: { digest } as SubtleCrypto,
      configurable: true,
    });
  }
  if (typeof g.crypto.getRandomValues !== 'function') {
    g.crypto.getRandomValues = ExpoCrypto.getRandomValues as Crypto['getRandomValues'];
  }
  if (typeof g.crypto.randomUUID !== 'function') {
    g.crypto.randomUUID = ExpoCrypto.randomUUID as Crypto['randomUUID'];
  }
}
