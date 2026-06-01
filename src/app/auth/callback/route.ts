import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicSupabaseConfig, siteOriginFromRequest } from "@/lib/app-url";

/**
 * OAuth/recovery callback. Supabase emails (e.g. password reset) link here with
 * a PKCE `code`; we exchange it for a session (setting cookies) then forward to
 * `next`. Redirect targets are built from a server-trusted origin and `next` is
 * restricted to internal paths — no open redirect.
 */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

export async function GET(req: NextRequest) {
  const supabaseConfig = publicSupabaseConfig();
  const code = req.nextUrl.searchParams.get("code");
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  const origin = siteOriginFromRequest(req);

  const fail = (msg: string) =>
    NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, origin));

  if (!supabaseConfig) return fail("ยังไม่ได้ตั้งค่า Supabase");
  if (!code) return fail("ลิงก์ไม่ถูกต้องหรือหมดอายุ");

  const res = NextResponse.redirect(new URL(next, origin));
  const supabase = createServerClient(supabaseConfig.url, supabaseConfig.anonKey, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail(error.message);
  return res;
}
