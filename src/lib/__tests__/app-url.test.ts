import { afterEach, describe, expect, it } from "vitest";
import {
  normalizeHttpOrigin,
  publicSupabaseConfig,
  siteOriginFromRequest,
} from "@/lib/app-url";

const originalEnv = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

function restoreEnv() {
  process.env.NEXT_PUBLIC_SITE_URL = originalEnv.siteUrl;
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnv.supabaseUrl;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalEnv.supabaseAnonKey;
}

function req(origin: string, host: string | null = null) {
  const url = new URL(origin);

  return {
    headers: {
      get(name: string) {
        return name.toLowerCase() === "host" ? host : null;
      },
    },
    nextUrl: {
      origin: url.origin,
      protocol: url.protocol,
    },
  };
}

afterEach(restoreEnv);

describe("app URL helpers", () => {
  it("normalizes a bare Vercel domain into an HTTPS origin", () => {
    expect(normalizeHttpOrigin("janus-deploy.vercel.app")).toBe(
      "https://janus-deploy.vercel.app",
    );
  });

  it("uses NEXT_PUBLIC_SITE_URL when it is a bare production host", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "janus-deploy.vercel.app";

    expect(siteOriginFromRequest(req("http://127.0.0.1:3000"))).toBe(
      "https://janus-deploy.vercel.app",
    );
  });

  it("falls back to the request origin when the configured site URL is invalid", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://";

    expect(siteOriginFromRequest(req("https://example.test"))).toBe(
      "https://example.test",
    );
  });

  it("accepts local hosts from request headers", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;

    expect(siteOriginFromRequest(req("http://localhost:3000", "127.0.0.1:3000"))).toBe(
      "http://127.0.0.1:3000",
    );
  });

  it("requires a valid Supabase URL and anon key", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "nedplvjmiyjkkusbemof.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    expect(publicSupabaseConfig()).toEqual({
      url: "https://nedplvjmiyjkkusbemof.supabase.co",
      anonKey: "anon-key",
    });

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://";
    expect(publicSupabaseConfig()).toBeNull();
  });
});
