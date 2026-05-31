"use client";

import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

/**
 * OCR screenshots live in a PRIVATE Supabase Storage bucket, namespaced by user
 * id ("{uid}/{uuid}.ext") so the per-user RLS policy (folder prefix = auth.uid)
 * isolates them. Uploads are best-effort: a failure never blocks saving the
 * trade — imagePath just stays null. Reads use short-lived signed URLs.
 */
const BUCKET = "screenshots";

export async function uploadScreenshot(uid: string, dataUrl: string): Promise<string | null> {
  if (!isSupabaseConfigured() || !uid || !dataUrl.startsWith("data:image/")) return null;
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg").replace("svg+xml", "svg");
    const path = `${uid}/${crypto.randomUUID()}.${ext}`;
    const { error } = await createClient()
      .storage.from(BUCKET)
      .upload(path, blob, { contentType: blob.type || "image/png", upsert: false });
    if (error) {
      console.error("screenshot upload failed:", error);
      return null;
    }
    return path;
  } catch (e) {
    console.error("screenshot upload failed:", e);
    return null;
  }
}

export async function getScreenshotUrl(path: string): Promise<string | null> {
  if (!isSupabaseConfigured() || !path) return null;
  try {
    const { data, error } = await createClient()
      .storage.from(BUCKET)
      .createSignedUrl(path, 3600);
    return error ? null : data.signedUrl;
  } catch {
    return null;
  }
}
