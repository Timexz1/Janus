/**
 * End-to-end encryption for API keys (brief: "admin must NOT be able to read the
 * key"). The encryption key is derived from a passphrase that NEVER leaves the
 * browser — only ciphertext + salt + iv are stored in the cloud, so neither the
 * server nor a database admin can recover the plaintext. AES-256-GCM (authenticated
 * encryption) with a PBKDF2-SHA256 derived key.
 *
 * Pure WebCrypto so it runs identically in the browser and in Node ≥ 20 tests.
 */

export interface CipherText {
  ct: string; // base64 ciphertext (incl. GCM auth tag)
  iv: string; // base64 12-byte nonce (unique per encryption)
}

export const PBKDF2_ITERATIONS = 600_000;
const VERIFIER_PLAINTEXT = "janus-vault-v1";

const subtle = (): SubtleCrypto => {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error("WebCrypto is unavailable in this environment");
  return c.subtle;
};

// --- base64 <-> bytes (no Buffer dependency; works in browser + Node) --------
function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomSaltB64(bytes = 16): string {
  return bytesToB64(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Derive a non-extractable AES-256-GCM key from a passphrase + salt. */
export async function deriveKey(
  passphrase: string,
  saltB64: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const baseKey = await subtle().importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return subtle().deriveKey(
    { name: "PBKDF2", salt: b64ToBytes(saltB64) as BufferSource, iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false, // non-extractable: the raw key bytes can never be read back out
    ["encrypt", "decrypt"],
  );
}

export async function encryptString(key: CryptoKey, plaintext: string): Promise<CipherText> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const buf = await subtle().encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return { ct: bytesToB64(new Uint8Array(buf)), iv: bytesToB64(iv) };
}

export async function decryptString(key: CryptoKey, cipher: CipherText): Promise<string> {
  const buf = await subtle().decrypt(
    { name: "AES-GCM", iv: b64ToBytes(cipher.iv) as BufferSource },
    key,
    b64ToBytes(cipher.ct) as BufferSource,
  );
  return new TextDecoder().decode(buf);
}

/** A verifier lets us confirm a passphrase is correct without storing any real
 *  secret: encrypt a known token; on unlock, decrypt and compare. */
export function makeVerifier(key: CryptoKey): Promise<CipherText> {
  return encryptString(key, VERIFIER_PLAINTEXT);
}

export async function checkVerifier(key: CryptoKey, verifier: CipherText): Promise<boolean> {
  try {
    return (await decryptString(key, verifier)) === VERIFIER_PLAINTEXT;
  } catch {
    return false; // GCM auth failure (wrong passphrase) throws
  }
}
