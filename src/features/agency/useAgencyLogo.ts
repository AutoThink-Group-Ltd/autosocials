import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const AGENCY_LOGO_EVENT = "agency-logo-updated";

/** The signed-in agency's logo URL; refreshes when settings broadcast a change. */
export function useAgencyLogo() {
  const { user } = useAuth();
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const load = () =>
      supabase.from("agency_profiles").select("agency_logo_url").eq("user_id", user.id).maybeSingle()
        .then(({ data }) => { if (alive) setLogo(data?.agency_logo_url || null); });
    load();
    const onChange = (e: Event) => setLogo((e as CustomEvent<string | null>).detail ?? null);
    window.addEventListener(AGENCY_LOGO_EVENT, onChange);
    return () => { alive = false; window.removeEventListener(AGENCY_LOGO_EVENT, onChange); };
  }, [user?.id]);
  return logo;
}
