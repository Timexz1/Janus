import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicSupabaseConfig, siteOriginFromRequest } from "@/lib/app-url";

function redirectTo(req: NextRequest, pathname: string) {
  return NextResponse.redirect(new URL(pathname, siteOriginFromRequest(req)));
}

/**
 * Refreshes the Supabase session cookie and protects routes when Supabase is
 * configured. With no Supabase env vars the app runs in local-only mode and
 * this middleware is a no-op.
 */
export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isAuthPage = path === "/login";
  const isAuthAction = path.startsWith("/auth/");

  if (isAuthAction) return NextResponse.next();

  const supabaseConfig = publicSupabaseConfig();
  if (!supabaseConfig) return NextResponse.next();

  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(supabaseConfig.url, supabaseConfig.anonKey, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });

  let user = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch (error) {
    console.error("[proxy] Supabase auth check failed", error);
    return isAuthPage ? res : redirectTo(req, "/login");
  }

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
