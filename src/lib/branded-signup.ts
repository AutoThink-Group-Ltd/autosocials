import { supabase } from "@/integrations/supabase/client";

/**
 * Creates the account and sends the branded confirmation email via SendGrid.
 * Replaces supabase.auth.signUp so the default backend mailer never fires.
 */
export async function brandedSignUp(
  email: string,
  password: string,
  metadata: Record<string, string> | undefined,
  redirectTo: string,
): Promise<{ error: { message: string } | null; userId?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("send-magic-link", {
      body: { email, password, type: "signup", redirect_to: redirectTo, metadata },
    });
    if (data?.error) return { error: { message: String(data.error) } };
    if (error) {
      const ctx = (error as { context?: Response }).context;
      const body = ctx ? await ctx.json().catch(() => null) : null;
      return { error: { message: body?.error ?? "We couldn't create your account. Please try again." } };
    }
    return { error: null, userId: data?.user_id };
  } catch {
    return { error: { message: "We couldn't create your account. Please try again." } };
  }
}
