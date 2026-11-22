import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { getRequestHeader } from "@tanstack/react-start/server";
import type { Database } from "@/integrations/supabase/types";

function env(name: string): string | undefined {
  return process.env[name];
}

export function supabaseUrl(): string {
  const url = env("SUPABASE_URL") ?? env("VITE_SUPABASE_URL") ?? import.meta.env.VITE_SUPABASE_URL;
  if (!url) throw new Error("SUPABASE_URL is not configured");
  return url;
}

function anonKey(): string {
  const key =
    env("SUPABASE_ANON_KEY") ??
    env("SUPABASE_PUBLISHABLE_KEY") ??
    env("VITE_SUPABASE_PUBLISHABLE_KEY") ??
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error("SUPABASE_ANON_KEY is not configured");
  return key;
}

/** Service-role client (bypasses RLS). Server-only; build per request. */
export function getAdminClient(): SupabaseClient<Database> {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return createClient<Database>(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Verifies the caller's `Authorization: Bearer <jwt>` header (attached by
 * attachSupabaseAuth) and returns the signed-in user. Throws when missing/invalid.
 */
export async function requireUser(): Promise<User> {
  const auth = getRequestHeader("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) throw new Error("Unauthorized");
  const client = createClient<Database>(supabaseUrl(), anonKey(), {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(auth.slice("Bearer ".length));
  if (error || !data.user) throw new Error("Unauthorized");
  return data.user;
}
