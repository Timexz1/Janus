"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Wallet,
  ListOrdered,
  CandlestickChart,
  ArrowLeftRight,
  Receipt,
  Settings,
  Plus,
  LogOut,
  LogIn,
} from "lucide-react";
import { useT } from "@/lib/i18n/context";
import { useAuth } from "@/lib/supabase/auth-context";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";

const LINKS = [
  { href: "/", key: "nav.dashboard", icon: LayoutDashboard },
  { href: "/holdings", key: "nav.holdings", icon: Wallet },
  { href: "/transactions", key: "nav.transactions", icon: ListOrdered },
  { href: "/charts", key: "nav.charts", icon: CandlestickChart },
  { href: "/remittances", key: "nav.remittances", icon: ArrowLeftRight },
  { href: "/tax", key: "nav.tax", icon: Receipt },
  { href: "/settings", key: "nav.settings", icon: Settings },
];

export function Nav() {
  const pathname = usePathname();
  const { t } = useT();
  const { user, loading, configured, signOut } = useAuth();
  const showProtectedNav = !configured || Boolean(user);

  return (
    <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-[1900px] items-center gap-2 px-3 py-2.5 sm:px-5 lg:px-8 2xl:px-10 min-[2400px]:max-w-[calc(100vw-320px)] min-[3400px]:max-w-[3120px]">
        <Link href="/" className="mr-2 flex shrink-0 items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white">
            J
          </span>
          <span className="text-sm font-semibold tracking-tight text-slate-100">Janus</span>
        </Link>

        {showProtectedNav ? (
          <nav className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-gutter:stable]">
            {LINKS.map(({ href, key, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                 className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-slate-800 text-slate-100"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="hidden whitespace-nowrap sm:inline">{t(key)}</span>
              </Link>
            );
            })}
          </nav>
        ) : null}

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {configured && user ? (
            <>
              <span className="hidden max-w-[140px] truncate text-xs text-slate-500 md:inline" title={user.email ?? ""}>
                {user.email}
              </span>
              <button
                type="button"
                onClick={() => signOut()}
                aria-label="ออกจากระบบ"
                title="ออกจากระบบ"
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-700 px-2.5 py-1.5 text-sm text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
              >
                <LogOut className="h-4 w-4 shrink-0" aria-hidden />
                <span className="hidden whitespace-nowrap sm:inline">ออก</span>
              </button>
            </>
          ) : configured && !loading && pathname !== "/login" ? (
            <Link
              href="/login"
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-700 px-2.5 py-1.5 text-sm text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
            >
              <LogIn className="h-4 w-4 shrink-0" aria-hidden />
              <span className="hidden whitespace-nowrap sm:inline">เข้าสู่ระบบ</span>
            </Link>
          ) : null}
          <LanguageToggle />
          <ThemeToggle />
          {showProtectedNav ? (
            <Link
              href="/transactions/new"
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
            >
              <Plus className="h-4 w-4 shrink-0" aria-hidden />
              <span className="hidden whitespace-nowrap sm:inline">{t("nav.add")}</span>
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
