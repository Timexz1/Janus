"use client";

import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  type CipherText,
  PBKDF2_ITERATIONS,
  deriveKey,
  encryptString,
  decryptString,
  makeVerifier,
  checkVerifier,
  randomSaltB64,
} from "@/lib/crypto/secret-crypto";

/**
 * Client-side vault for API keys (E2EE). The derived AES key and the decrypted
 * keys live ONLY in this module's memory for the session — never persisted, never
 * sent to a server. The cloud row (table `encrypted_secrets`) holds nothing but
 * ciphertext + salt, so an admin reading the database learns nothing.
 *
 * Lifecycle: setup (first time) → unlock (each session) → get/set → lock.
 */

const TABLE = "encrypted_secrets";

interface VaultMeta {
  salt: string;
  iterations: number;
  verifier: CipherText;
}

let key: CryptoKey | null = null;
let meta: VaultMeta | null = null;
let cipherSecrets: Record<string, CipherText> = {};
let plainSecrets: Record<string, string> = {};

const listeners = new Set<() => void>();
function notify() {
  for (const cb of listeners) cb();
}
export function subscribeVault(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export type VaultStatus = "unconfigured" | "no-vault" | "locked" | "unlocked";

function sb() {
  return createClient();
}

async function fetchRow(): Promise<{
  salt: string;
  iterations: number;
  verifier: CipherText;
  secrets: Record<string, CipherText>;
} | null> {
  const { data, error } = await sb()
    .from(TABLE)
    .select("salt, iterations, verifier, secrets")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    salt: data.salt as string,
    iterations: (data.iterations as number) ?? PBKDF2_ITERATIONS,
    verifier: data.verifier as CipherText,
    secrets: (data.secrets as Record<string, CipherText>) ?? {},
  };
}

/** Is a vault row present for this user? (i.e. has a passphrase been set up?) */
export async function vaultExists(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  return (await fetchRow()) !== null;
}

export function vaultStatus(): VaultStatus {
  if (!isSupabaseConfigured()) return "unconfigured";
  if (key) return "unlocked";
  return meta ? "locked" : "no-vault";
}

export function isUnlocked(): boolean {
  return key !== null;
}

/** Create the vault for the first time with a chosen passphrase. */
export async function setupVault(passphrase: string): Promise<void> {
  if (await vaultExists()) throw new Error("ตั้ง passphrase ไว้แล้ว");
  const salt = randomSaltB64();
  const k = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
  const verifier = await makeVerifier(k);
  const { error } = await sb().from(TABLE).upsert(
    { user_id: (await currentUserId()), salt, iterations: PBKDF2_ITERATIONS, verifier, secrets: {} },
    { onConflict: "user_id" },
  );
  if (error) throw error;
  key = k;
  meta = { salt, iterations: PBKDF2_ITERATIONS, verifier };
  cipherSecrets = {};
  plainSecrets = {};
  notify();
}

/** Unlock for the session: verify the passphrase, then decrypt all stored keys. */
export async function unlockVault(passphrase: string): Promise<boolean> {
  const row = await fetchRow();
  if (!row) throw new Error("ยังไม่ได้ตั้ง passphrase");
  const k = await deriveKey(passphrase, row.salt, row.iterations);
  if (!(await checkVerifier(k, row.verifier))) return false;
  key = k;
  meta = { salt: row.salt, iterations: row.iterations, verifier: row.verifier };
  cipherSecrets = row.secrets;
  plainSecrets = {};
  for (const [provider, cipher] of Object.entries(row.secrets)) {
    try {
      plainSecrets[provider] = await decryptString(k, cipher);
    } catch {
      /* skip a corrupt entry rather than fail the whole unlock */
    }
  }
  notify();
  return true;
}

/** Drop all key material from memory (e.g. on logout or "lock"). */
export function lockVault(): void {
  key = null;
  cipherSecrets = {};
  plainSecrets = {};
  notify();
}

/** Forget everything, including the loaded meta (used on sign-out). */
export function resetVault(): void {
  key = null;
  meta = null;
  cipherSecrets = {};
  plainSecrets = {};
  notify();
}

async function currentUserId(): Promise<string> {
  const { data } = await sb().auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error("ต้องเข้าสู่ระบบก่อน");
  return id;
}

async function persistSecrets(): Promise<void> {
  const { error } = await sb()
    .from(TABLE)
    .update({ secrets: cipherSecrets, updated_at: new Date().toISOString() })
    .eq("user_id", await currentUserId());
  if (error) throw error;
}

/** Encrypt + store an API key. Requires the vault to be unlocked. */
export async function setSecret(provider: string, plaintext: string): Promise<void> {
  if (!key) throw new Error("ปลดล็อก vault ก่อน");
  cipherSecrets[provider] = await encryptString(key, plaintext);
  plainSecrets[provider] = plaintext;
  await persistSecrets();
  notify();
}

export async function removeSecret(provider: string): Promise<void> {
  if (!key) throw new Error("ปลดล็อก vault ก่อน");
  delete cipherSecrets[provider];
  delete plainSecrets[provider];
  await persistSecrets();
  notify();
}

/** Decrypted key for a provider (in-memory; null if locked or unset). */
export function getSecret(provider: string): string | null {
  return plainSecrets[provider] ?? null;
}

/** Providers that currently have a stored key. */
export function storedProviders(): string[] {
  return Object.keys(cipherSecrets);
}
