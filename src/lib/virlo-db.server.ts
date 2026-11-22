import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "./supabase-admin.server";

type Row = Record<string, unknown>;
type Table = { Row: Row; Insert: Row; Update: Row; Relationships: [] };
type VirloSchema = { public: { Tables: { virlo_research_activity: Table; virlo_research_results: Table; virlo_research_resources: Table }; Views: Record<never, never>; Functions: Record<never, never> } };
export const virloDb = () => getAdminClient() as unknown as SupabaseClient<VirloSchema>;
