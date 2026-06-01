"use client";

import { useEffect, useRef, useState } from "react";
import { Lock, LockKeyhole, ShieldCheck, Check, Trash2, KeyRound } from "lucide-react";
import {
  vaultExists,
  isUnlocked,
  setupVault,
  unlockVault,
  lockVault,
  setSecret,
  removeSecret,
  storedProviders,
  subscribeVault,
} from "@/lib/store/secret-vault";
import { Button, Card, Field, Input } from "@/components/ui";

const PROVIDERS: { id: string; label: string; placeholder: string }[] = [
  { id: "claude", label: "Claude (Anthropic)", placeholder: "sk-ant-..." },
  { id: "gemini", label: "Gemini (Google)", placeholder: "AIza..." },
  { id: "typhoon", label: "Typhoon OCR", placeholder: "sk-..." },
  { id: "alpaca_key", label: "Alpaca Market Data Key", placeholder: "PK..." },
  { id: "alpaca_secret", label: "Alpaca Market Data Secret", placeholder: "..." },
];

export function SecretVaultCard() {
  const [loading, setLoading] = useState(true);
  const [exists, setExists] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [, force] = useState(0);

  useEffect(() => {
    let alive = true;
    vaultExists()
      .then((e) => alive && (setExists(e), setUnlocked(isUnlocked())))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    const unsub = subscribeVault(() => {
      if (!alive) return;
      setUnlocked(isUnlocked());
      force((n) => n + 1);
    });
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-indigo-400" aria-hidden />
        <h2 className="text-sm font-semibold text-slate-200">API Key เข้ารหัส (E2E บนคลาวด์)</h2>
      </div>
      <p className="text-xs leading-relaxed text-slate-500">
        เข้ารหัสฝั่งเบราว์เซอร์ด้วย passphrase ของคุณ (AES-256) — คลาวด์เก็บแค่ข้อความที่เข้ารหัสแล้ว
        <b className="text-slate-400"> แม้แต่ admin ก็อ่าน key ไม่ได้</b> · ลืม passphrase = ต้องตั้ง key ใหม่
      </p>

      {loading ? (
        <div className="h-10 animate-pulse rounded bg-slate-800/40" />
      ) : !exists ? (
        <SetupForm onDone={() => setExists(true)} />
      ) : !unlocked ? (
        <UnlockForm />
      ) : (
        <ManageKeys />
      )}
    </Card>
  );
}

function SetupForm({ onDone }: { onDone: () => void }) {
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (pass.length < 8) return setErr("passphrase อย่างน้อย 8 ตัวอักษร");
    if (pass !== confirm) return setErr("passphrase ไม่ตรงกัน");
    setBusy(true);
    try {
      await setupVault(pass);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ตั้ง passphrase ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-slate-800 p-3">
      <p className="text-xs text-slate-400">ตั้ง passphrase สำหรับเข้ารหัส (จำให้แม่น — กู้คืนไม่ได้ถ้าลืม)</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="passphrase" htmlFor="v-pass">
          <Input id="v-pass" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
        </Field>
        <Field label="ยืนยัน passphrase" htmlFor="v-confirm">
          <Input id="v-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
      </div>
      {err ? <p className="text-xs text-rose-400">{err}</p> : null}
      <Button onClick={submit} disabled={busy}>
        <KeyRound className="h-4 w-4" aria-hidden /> ตั้ง passphrase + เปิด vault
      </Button>
    </div>
  );
}

function UnlockForm() {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    const pass = ref.current?.value ?? "";
    if (!pass) return setErr("ใส่ passphrase");
    setBusy(true);
    try {
      const ok = await unlockVault(pass);
      if (!ok) setErr("passphrase ไม่ถูกต้อง");
      else if (ref.current) ref.current.value = "";
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ปลดล็อกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-slate-800 p-3">
      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        <Lock className="h-3.5 w-3.5" aria-hidden /> vault ถูกล็อก — ใส่ passphrase เพื่อใช้ key
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <Field label="passphrase" htmlFor="v-unlock">
            <Input
              ref={ref}
              id="v-unlock"
              type="password"
              autoComplete="current-password"
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </Field>
        </div>
        <Button onClick={submit} disabled={busy}>
          <LockKeyhole className="h-4 w-4" aria-hidden /> ปลดล็อก
        </Button>
      </div>
      {err ? <p className="text-xs text-rose-400">{err}</p> : null}
    </div>
  );
}

function ManageKeys() {
  const stored = new Set(storedProviders());
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs text-emerald-400">
          <LockKeyhole className="h-3.5 w-3.5" aria-hidden /> ปลดล็อกแล้ว — ใส่/แก้ key ได้
        </p>
        <Button variant="outline" className="!py-1 text-xs" onClick={() => lockVault()}>
          <Lock className="h-3.5 w-3.5" aria-hidden /> ล็อก
        </Button>
      </div>
      {PROVIDERS.map((p) => (
        <ProviderRow key={p.id} id={p.id} label={p.label} placeholder={p.placeholder} hasKey={stored.has(p.id)} />
      ))}
    </div>
  );
}

function ProviderRow({
  id,
  label,
  placeholder,
  hasKey,
}: {
  id: string;
  label: string;
  placeholder: string;
  hasKey: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const v = ref.current?.value.trim() ?? "";
    if (!v) return;
    setBusy(true);
    try {
      await setSecret(id, v);
      if (ref.current) ref.current.value = "";
    } finally {
      setBusy(false);
    }
  }
  async function clear() {
    setBusy(true);
    try {
      await removeSecret(id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[220px] flex-1">
        <Field label={label}>
          <Input
            ref={ref}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={hasKey ? "●●●●●●●● (ตั้งแล้ว — ใส่ใหม่เพื่อเปลี่ยน)" : placeholder}
          />
        </Field>
      </div>
      <Button onClick={save} disabled={busy}>
        <Check className="h-4 w-4" aria-hidden /> บันทึก
      </Button>
      {hasKey ? (
        <Button variant="danger" onClick={clear} disabled={busy}>
          <Trash2 className="h-4 w-4" aria-hidden /> ลบ
        </Button>
      ) : null}
    </div>
  );
}
