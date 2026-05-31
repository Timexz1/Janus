import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const LOCAL_HOST_RE = /^(localhost|127(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}|\[::1\])(?::\d+)?$/i;

function siteOrigin(req: NextRequest) {
  const host = req.headers.get("host");
  if (host && LOCAL_HOST_RE.test(host)) {
    const protocol = req.nextUrl.protocol.replace(/:$/, "") || "http";
    return `${protocol}://${host}`;
  }
  return process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;
}

function redirectTo(req: NextRequest, pathname: string) {
  return NextResponse.redirect(new URL(pathname, siteOrigin(req)));
}

/**
 * Refreshes the Supabase session cookie and protects routes when Supabase is
 * configured. With no Supabase env vars the app runs in local-only mode and
 * this middleware is a no-op.
 */
export async function proxy(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();

  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;
  const isAuthPage = path === "/login";
  const isAuthAction = path.startsWith("/auth/");

  if (isAuthAction) return res;

  if (!user && !isAuthPage) {
    return redirectTo(req, "/login");
  }
  if (user && isAuthPage) {
    return redirectTo(req, "/");
  }
  return res;
}

export const config = {
  matcher: ["/((?!api|_next|favicon.ico|.*\\..*).*)"],
};
