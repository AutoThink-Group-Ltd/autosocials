import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "./client";

/**
 * Client-side function middleware: forwards the signed-in user's access token
 * as an `Authorization: Bearer` header on every server-function RPC, so server
 * handlers can verify the caller (mirrors what supabase.functions.invoke did).
 */
export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return next(token ? { headers: { Authorization: `Bearer ${token}` } } : {});
});
