import { createClient } from "@supabase/supabase-js";

// Server-only: the secret key bypasses RLS. The bucket is private; files leave it only through
// short-lived signed links issued after an access check.
const BUCKET = "items";

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
}

export async function putFile(path: string, body: Uint8Array, contentType: string) {
  const { error } = await admin().storage.from(BUCKET).upload(path, body, { contentType, upsert: false });
  if (error) throw new Error(`storage upload failed: ${error.message}`);
}

export async function signedUrl(path: string, seconds = 120) {
  const { data, error } = await admin().storage.from(BUCKET).createSignedUrl(path, seconds, { download: true });
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function removeFile(path: string) {
  await admin().storage.from(BUCKET).remove([path]);
}
