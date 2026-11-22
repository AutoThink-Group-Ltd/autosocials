import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { canManageAgency, type AgencyStaffRole } from "@/lib/invites";

/** Who the signed-in agency user works for, and whether they can manage the agency. */
export function useAgencyRole() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["agency-role", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const [r, o] = await Promise.all([
        supabase.rpc("agency_staff_role", { _user_id: user!.id }),
        supabase.rpc("agency_staff_owner", { _user_id: user!.id }),
      ]);
      return { role: (r.data as AgencyStaffRole | null) ?? null, ownerId: (o.data as string | null) ?? null };
    },
  });
  const role = q.data?.role ?? null;
  return { role, ownerId: q.data?.ownerId ?? null, isAdmin: canManageAgency(role), loading: q.isLoading };
}
