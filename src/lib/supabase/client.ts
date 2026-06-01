"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicSupabaseConfig } from "@/lib/app-url";

/**
 * Supabase browser client (brief Phase 1b). The app runs entirely on the local
 * store until these public env vars are present; auth/cloud features activate
 * only when configured. The service-role key is NEVER referenced here.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(publicSupabaseConfig());
}

export function createClient() {
  const config = publicSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured");
  return createBrowserClient(config.url, config.anonKey);
}
