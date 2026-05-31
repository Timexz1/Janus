"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase browser client (brief Phase 1b). The app runs entirely on the local
 * store until these public env vars are present; auth/cloud features activate
 * only when configured. The service-role key is NEVER referenced here.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
