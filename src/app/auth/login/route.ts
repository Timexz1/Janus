import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const LOCAL_HOST_RE = /^(localhost|127(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}|\[::1\])(?::\d+)?$/i;

// Build redirect targets from a server-trusted origin.
// Host is accepted only for explicit local addresses because NextURL normalizes
// 127.0.0.1 to localhost. Production still prefers NEXT_PUBLIC_SITE_URL.
function siteOrigin(req: NextRequest) {
  const host = req.headers.get("host");
  if (host && LOCAL_HOST_RE.test(host)) {
    const protocol = req.nextUrl.protocol.replace(/:$/, "") || "http";
    return `${protocol}://${host}`;
  }
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
