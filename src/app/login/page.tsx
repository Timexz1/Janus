"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { isSupabaseConfigured, createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Input } from "@/components/ui";

type Mode = "login" | "signup" | "forgot";

export default function LoginPage() {
  const configured = isSupabaseConfigured();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Surface errors handed back by /auth/* routes (e.g. ?error=... from the
  // server login or the recovery callback).
  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get("error");
    if (err) setMsg(err);
  }, []);

  if (!configured) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-8">
        <h1 className="text-lg font-semibold text-slate-100">เข้าสู่ระบบ</h1>
        <Card className="border-[color:var(--warning-border)] bg-[color:var(--warning-bg)]">
          <p className="flex items-start gap-2 text-sm leading-relaxed text-[color:var(--warning-text)]">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--warning-strong)]" aria-hidden />
            <span>
              ตอนนี้แอปทำงานแบบ <b>เก็บข้อมูลในเบราว์เซอร์</b> (local) ยังไม่ได้เปิด
              Supabase — เมื่อตั้งค่า <code>NEXT_PUBLIC_SUPABASE_URL</code> และ{" "}
              <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> ใน <code>.env.local</code>{" "}
              และรัน migration ใน <code>supabase/migrations</code> แล้ว ระบบ Auth (อีเมล)
              + เก็บข้อมูลบนคลาวด์พร้อม RLS จะเปิดใช้งานทันที (ดู SUPABASE.md)
            </span>
          </p>
        </Card>
        <Link href="/" className="text-sm text-indigo-400 hover:text-indigo-300">
          ← กลับแดชบอร์ด
        </Link>
      </div>
    );
  }

  async function submit(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    const currentEmail = (emailRef.current?.value ?? email).trim();
    const currentPassword = passwordRef.current?.value ?? password;

    if (!currentEmail) {
      setMsg("กรุณากรอกอีเมล");
      return;
    }
    if (mode !== "forgot" && !currentPassword) {
      setMsg("กรุณากรอกรหัสผ่าน");
      return;
    }

    setEmail(currentEmail);
    setPassword(currentPassword);
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    try {
      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: currentEmail,
          password: currentPassword,
        });
        if (error) {
          setMsg(error.message);
          return;
        }
        if (!data.session) {
          setMsg("เข้าสู่ระบบสำเร็จ แต่ยังไม่พบ session กรุณาลองอีกครั้ง");
          return;
        }
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user) {
          setMsg(userError?.message ?? "เข้าสู่ระบบสำเร็จ แต่ตรวจสอบผู้ใช้ไม่สำเร็จ");
          return;
        }
        setMsg("เข้าสู่ระบบสำเร็จ กำลังไปหน้าแดชบอร์ด...");
        await new Promise((resolve) => setTimeout(resolve, 100));
        router.replace("/");
        router.refresh();
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: currentEmail,
          password: currentPassword,
        });
        setMsg(error ? error.message : "สมัครสำเร็จ — ตรวจอีเมลเพื่อยืนยัน");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(currentEmail, {
          redirectTo: `${window.location.origin}/auth/callback?next=/auth/update-password`,
        });
        setMsg(error ? error.message : "ส่งลิงก์รีเซ็ตรหัสผ่านไปที่อีเมลแล้ว — เปิดลิงก์ในอีเมลเพื่อตั้งรหัสใหม่");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-4 py-8">
      <h1 className="text-lg font-semibold text-slate-100">
        {mode === "signup" ? "สมัครสมาชิก" : mode === "forgot" ? "ลืมรหัสผ่าน" : "เข้าสู่ระบบ"}
      </h1>
      <Card>
        <form
          action={mode === "login" ? "/auth/login" : undefined}
          method={mode === "login" ? "post" : undefined}
          onSubmit={mode === "login" ? undefined : submit}
          className="space-y-4"
        >
        <Field label="อีเมล" htmlFor="email">
          <Input
            ref={emailRef}
            id="email"
            name="email"
            type="email"
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        {mode !== "forgot" ? (
          <Field label="รหัสผ่าน" htmlFor="pw">
            <Input
              ref={passwordRef}
              id="pw"
              name="password"
              type="password"
              value={password}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        ) : null}
        <Button type="submit" disabled={busy} className="w-full">
          {mode === "signup" ? "สมัคร" : mode === "forgot" ? "ส่งลิงก์รีเซ็ต" : "เข้าสู่ระบบ"}
        </Button>
        {msg ? <p className="text-sm text-slate-300">{msg}</p> : null}
        <div className="flex justify-between text-xs text-slate-500">
          <button type="button" className="hover:text-slate-300" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
            {mode === "login" ? "ยังไม่มีบัญชี? สมัคร" : "มีบัญชีแล้ว? เข้าสู่ระบบ"}
          </button>
          <button type="button" className="hover:text-slate-300" onClick={() => setMode("forgot")}>
            ลืมรหัสผ่าน?
          </button>
        </div>
        </form>
      </Card>
    </div>
  );
}
