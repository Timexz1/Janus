import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Build redirect targets from a server-trusted origin only — never from the
// client-controlled Origin/Host headers (open-redirect / host-header injection).
// NEXT_PUBLIC_SITE_URL wins in production; req.nextUrl.origin is the safe fallback.
function siteOrigin(req: NextRequest) {
  return process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;
}

function redirectToLogin(req: NextRequest, message: string) {
  const to = new URL("/login", siteOrigin(req));
  to.searchParams.set("error", message);
  return NextResponse.redirect(to, { status: 303 });
}

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return redirectToLogin(req, "ยังไม่ได้ตั้งค่า Supabase");
  }

  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) {
    return redirectToLogin(req, "กรุณากรอกอีเมลและรหัสผ่าน");
  }

  const res = NextResponse.redirect(new URL("/", siteOrigin(req)), { status: 303 });
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return redirectToLogin(req, error.message);
  }

  return res;
}
