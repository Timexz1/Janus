"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { isSupabaseConfigured, createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Input } from "@/components/ui";

/**
 * Lands here after the password-reset email link goes through /auth/callback,
 * which exchanges the code for a (recovery) session. With that session present,
 * updateUser can set a new password. Reaching this page without a recovery
 * session is bounced to /login by the auth guard.
 */
export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    if (password.length < 6) return setMsg("รหัสผ่านอย่างน้อย 6 ตัวอักษร");
    if (password !== confirm) return setMsg("รหัสผ่านไม่ตรงกัน");
    setBusy(true);
    try {
      const { error } = await createClient().auth.updateUser({ password });
      if (error) {
        setMsg(error.message);
        return;
      }
      setDone(true);
      setMsg("ตั้งรหัสผ่านใหม่สำเร็จ — กำลังไปแดชบอร์ด...");
      setTimeout(() => {
        router.replace("/");
        router.refresh();
      }, 900);
    } finally {
      setBusy(false);
    }
  }

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-md py-8">
        <Card>
          <p className="text-sm text-slate-300">ยังไม่ได้เปิดใช้งาน Supabase</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 py-8">
      <h1 className="text-lg font-semibold text-slate-100">ตั้งรหัสผ่านใหม่</h1>
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <Field label="รหัสผ่านใหม่" htmlFor="new-pw">
            <Input
              id="new-pw"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="ยืนยันรหัสผ่านใหม่" htmlFor="confirm-pw">
            <Input
              id="confirm-pw"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          <Button type="submit" disabled={busy || done} className="w-full">
            บันทึกรหัสผ่านใหม่
          </Button>
          {msg ? <p className="text-sm text-slate-300">{msg}</p> : null}
        </form>
      </Card>
    </div>
  );
}
