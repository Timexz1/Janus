import { describe, it, expect } from "vitest";
import {
  deriveKey,
  encryptString,
  decryptString,
  makeVerifier,
  checkVerifier,
  randomSaltB64,
} from "@/lib/crypto/secret-crypto";

// Fewer iterations keeps the suite fast; the production default is 600k.
const ITER = 50_000;

describe("secret-crypto (E2EE API keys)", () => {
  it("round-trips a secret through encrypt → decrypt", async () => {
    const salt = randomSaltB64();
    const key = await deriveKey("correct horse battery staple", salt, ITER);
    const secret = "sk-ant-abc123_VERY-secret_key";
    const cipher = await encryptString(key, secret);
    expect(cipher.ct).not.toContain(secret); // never appears in plaintext form
    expect(await decryptString(key, cipher)).toBe(secret);
  });

  it("cannot decrypt with the wrong passphrase", async () => {
    const salt = randomSaltB64();
    const right = await deriveKey("right-pass", salt, ITER);
    const wrong = await deriveKey("wrong-pass", salt, ITER);
    const cipher = await encryptString(right, "sk-ant-secret");
    await expect(decryptString(wrong, cipher)).rejects.toBeTruthy();
  });

  it("uses a fresh IV each time (same input → different ciphertext)", async () => {
    const salt = randomSaltB64();
    const key = await deriveKey("pass", salt, ITER);
    const a = await encryptString(key, "same");
    const b = await encryptString(key, "same");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
    expect(await decryptString(key, a)).toBe("same");
    expect(await decryptString(key, b)).toBe("same");
  });

  it("verifier validates the right passphrase and rejects the wrong one", async () => {
    const salt = randomSaltB64();
    const key = await deriveKey("vault-pass", salt, ITER);
    const verifier = await makeVerifier(key);
    expect(await checkVerifier(key, verifier)).toBe(true);

    const wrong = await deriveKey("nope", salt, ITER);
    expect(await checkVerifier(wrong, verifier)).toBe(false);
  });

  it("a different salt yields a different key for the same passphrase", async () => {
    const k1 = await deriveKey("pass", randomSaltB64(), ITER);
    const k2 = await deriveKey("pass", randomSaltB64(), ITER);
    const cipher = await encryptString(k1, "secret");
    await expect(decryptString(k2, cipher)).rejects.toBeTruthy();
  });
});
