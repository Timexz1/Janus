const LOCAL_HOST_RE = /^(localhost|127(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}|\[::1\])(?::\d+)?$/i;

interface RequestLike {
  headers: {
    get(name: string): string | null;
  };
  nextUrl: {
    origin: string;
    protocol: string;
  };
}

export function normalizeHttpOrigin(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function siteOriginFromRequest(req: RequestLike): string {
  const configured = normalizeHttpOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (configured) return configured;

  const host = req.headers.get("host");
  if (host && LOCAL_HOST_RE.test(host)) {
    const protocol = req.nextUrl.protocol.replace(/:$/, "") || "http";
    return `${protocol}://${host}`;
  }

  return req.nextUrl.origin;
}

export function publicSupabaseConfig(): { url: string; anonKey: string } | null {
  const url = normalizeHttpOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}
