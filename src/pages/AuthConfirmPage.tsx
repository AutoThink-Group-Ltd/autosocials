import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";

const PRODUCTION_ORIGIN = "https://autosocials.com";

const resolveRedirectTarget = (redirectToParam: string | null) => {
  if (!redirectToParam) return "/app";

  try {
    const parsed = new URL(redirectToParam, window.location.origin);
    const allowedOrigins = new Set([window.location.origin, PRODUCTION_ORIGIN]);

    if (!allowedOrigins.has(parsed.origin)) return "/app";

    if (parsed.origin === window.location.origin) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/app";
    }

    return parsed.toString();
  } catch {
    return redirectToParam.startsWith("/") ? redirectToParam : "/app";
  }
};

const AuthConfirmPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type") as "signup" | "magiclink" | "recovery" | "email_change" | "invite";
    const redirectTarget = resolveRedirectTarget(searchParams.get("redirect_to"));

    if (!tokenHash || !type) {
      setError("Invalid verification link.");
      return;
    }

    const verify = async () => {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });

      if (verifyError) {
        setError(verifyError.message);
        return;
      }

      if (type === "recovery") {
        navigate("/reset-password", { replace: true });
        return;
      }

      if (redirectTarget.startsWith("http://") || redirectTarget.startsWith("https://")) {
        window.location.replace(redirectTarget);
        return;
      }

      navigate(redirectTarget, { replace: true });
    };

    verify();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        {error ? (
          <>
            <h1 className="text-2xl font-bold text-foreground">Verification Failed</h1>
            <p className="text-muted-foreground">{error}</p>
            <a href="/auth" className="text-primary hover:underline">Back to sign in</a>
          </>
        ) : (
          <>
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
            <p className="text-muted-foreground">Verifying your account...</p>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthConfirmPage;
