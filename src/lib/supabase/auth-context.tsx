"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { isSupabaseConfigured, createClient } from "./client";
import { startCloudSync, stopCloudSync } from "@/lib/store/cloud";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  configured: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  loading: true,
  configured: false,
  signOut: async () => {},
});

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

async function readAuthUser(sb: ReturnType<typeof createClient>): Promise<User | null> {
  const verified = await withTimeout(
    sb.auth.getUser().then(({ data }) => data.user ?? null),
    5000,
  );
  if (verified) return verified;

  const sessionUser = await withTimeout(
    sb.auth.getSession().then(({ data }) => data.session?.user ?? null),
    2000,
  );
  return sessionUser ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(configured);
  const pathname = usePathname();
  const router = useRouter();
  const startedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!configured) return;
    const sb = createClient();
    let alive = true;

    function syncCloudFor(u: User) {
      if (startedFor.current === u.id) return;
      startedFor.current = u.id;
      startCloudSync(sb, u.id).catch((err) => {
        console.error("[auth] cloud sync failed", err);
      });
    }

    function applyUser(u: User | null, clearOnEmpty = false) {
      if (!alive) return;
      if (u) {
        setUser(u);
        setLoading(false);
        syncCloudFor(u);
      } else if (clearOnEmpty) {
        startedFor.current = null;
        stopCloudSync();
        setUser(null);
        setLoading(false);
      } else {
        setUser(null);
        setLoading(false);
      }
    }

    readAuthUser(sb)
      .then((currentUser) => applyUser(currentUser))
      .catch(() => applyUser(null));

    const { data: sub } = sb.auth.onAuthStateChange(async (event, session) => {
      applyUser(session?.user ?? null, event === "SIGNED_OUT");
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [configured]);

  // client-side route guard (server proxy handles full navigations). Re-check
  // Supabase before redirecting so a just-signed-in user is not bounced back to
  // /login while the auth state event is still catching up.
  useEffect(() => {
    if (!configured || loading) return;
    if (!user && pathname !== "/login") {
      let cancelled = false;
      const sb = createClient();
      queueMicrotask(() => {
        if (!cancelled) setLoading(true);
      });
      readAuthUser(sb)
        .then((currentUser) => {
          if (cancelled) return;
          if (currentUser) {
            setUser(currentUser);
            setLoading(false);
            if (startedFor.current !== currentUser.id) {
              startedFor.current = currentUser.id;
              startCloudSync(sb, currentUser.id).catch((err) => {
                console.error("[auth] cloud sync failed", err);
              });
            }
          } else {
            setLoading(false);
            router.replace("/login");
          }
        })
        .catch(() => {
          if (cancelled) return;
          setLoading(false);
          router.replace("/login");
        });
      return () => {
        cancelled = true;
      };
    }
    if (user && pathname === "/login") router.replace("/");
  }, [configured, loading, user, pathname, router]);

  const signOut = async () => {
    if (!configured) return;
    try {
      await Promise.race([
        createClient().auth.signOut(),
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ]);
    } finally {
      startedFor.current = null;
      stopCloudSync();
      setUser(null);
      setLoading(false);
      router.replace("/login");
      router.refresh();
    }
  };

  const isLoginPage = pathname === "/login";
  const hideProtectedContent =
    configured && !isLoginPage && (loading || !user);

  if (hideProtectedContent) {
    return (
      <Ctx.Provider value={{ user, loading, configured, signOut }}>
        <div className="grid min-h-screen place-items-center bg-background px-4 text-foreground">
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm text-slate-400">
            {loading ? "กำลังตรวจสอบการเข้าสู่ระบบ..." : "กำลังไปหน้าเข้าสู่ระบบ..."}
          </div>
        </div>
      </Ctx.Provider>
    );
  }

  return (
    <Ctx.Provider value={{ user, loading, configured, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  return useContext(Ctx);
}
