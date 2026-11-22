import { useEffect } from "react";

/**
 * Public landing page used as the OAuth popup's final stop. Same-origin as the
 * main app, so a BroadcastChannel message reaches the original tab even when
 * Facebook's COOP severed `window.opener`.
 */
export default function OAuthBridgePage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payload: Record<string, string> = { source: "autosocials-oauth" };
    for (const [k, v] of params.entries()) payload[k] = v;

    try {
      const ch = new BroadcastChannel("autosocials-oauth");
      ch.postMessage(payload);
      ch.close();
    } catch { /* noop */ }
    try { window.opener?.postMessage(payload, "*"); } catch { /* noop */ }
    // localStorage event fires in other same-origin tabs
    try {
      localStorage.setItem("autosocials-oauth", JSON.stringify({ ...payload, _ts: Date.now() }));
    } catch { /* noop */ }

    const t = setTimeout(() => { try { window.close(); } catch { /* noop */ } }, 120);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ font: "14px -apple-system,Segoe UI,sans-serif", color: "#475569", display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", margin: 0, background: "#f8fafc" }}>
      <div style={{ textAlign: "center" }}>
        <p>Connection complete</p>
        <p style={{ fontSize: 12, color: "#94a3b8" }}>You can close this window.</p>
      </div>
    </div>
  );
}