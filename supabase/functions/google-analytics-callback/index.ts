import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error || !code) {
      return new Response(
        `<html><body style="font-family:sans-serif;text-align:center;padding:60px">
          <h2>❌ Connection Failed</h2>
          <p>${error || "No authorization code received"}</p>
          <p>Close this window and try again.</p>
        </body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!;
    const redirectUri = `${supabaseUrl}/functions/v1/google-analytics-callback`;

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error("Token exchange error:", tokenData);
      return new Response(
        `<html><body style="font-family:sans-serif;text-align:center;padding:60px">
          <h2>❌ Error</h2><p>${tokenData.error_description || tokenData.error}</p>
        </body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    const service = state || "analytics";
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    const { error: dbError } = await supabase
      .from("google_oauth_tokens")
      .upsert(
        {
          service,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "service" }
      );

    if (dbError) {
      console.error("DB error:", dbError);
      return new Response(
        `<html><body style="font-family:sans-serif;text-align:center;padding:60px">
          <h2>❌ Error</h2><p>Failed to save credentials</p>
        </body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    const serviceName = service === "search_console" ? "Search Console" : "Google Analytics";

    return new Response(
      `<html><head><title>Connected</title></head>
      <body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2>✅ ${serviceName} Connected!</h2>
        <p>You can close this window now.</p>
        <script>
          setTimeout(() => {
            if (window.opener) {
              window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', service: '${service}' }, '*');
            }
            window.close();
          }, 2000);
        </script>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (err) {
    console.error("Callback error:", err);
    return new Response(
      `<html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2>❌ Error</h2><p>Something went wrong</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
});
