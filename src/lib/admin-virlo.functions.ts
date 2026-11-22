import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AuthContext = {
  supabase: {
    rpc: (
      name: string,
      args: Record<string, string>,
    ) => Promise<{ data: unknown; error: unknown }>;
  };
  userId: string;
};
type UsageSchema = {
  public: {
    Tables: {
      virlo_research_activity: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      virlo_usage_summary: {
        Args: {
          p_workspace_id: string | null;
          p_user_id: string | null;
          p_operation: string | null;
          p_status: string | null;
          p_from: string | null;
          p_before: string | null;
        };
        Returns: Array<{
          total: number;
          reported_gross_usd: number;
          reported_cost_count: number;
          no_response_recorded_usd: number;
          no_response_recorded_count: number;
          estimated_only_usd: number;
          estimated_only_count: number;
          no_receipt_or_estimate_count: number;
          unresolved_count: number;
          reported_credits: number;
          reported_credit_count: number;
        }>;
      };
    };
  };
};
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) &&
      new Date(`${v}T00:00:00Z`).toISOString().startsWith(v),
    "Enter a valid date",
  );
const inputSchema = z
  .object({
    workspaceId: z.string().uuid().optional(),
    userId: z.string().uuid().optional(),
    operation: z.string().trim().max(100).optional(),
    status: z.enum(["started", "completed", "failed", "unknown"]).optional(),
    from: date.optional(),
    to: date.optional(),
    page: z.number().int().min(0).max(1000).default(0),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: "Start date must not be after end date",
  });

export type VirloUsageRow = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  userId: string;
  userName: string;
  operation: string;
  status: string;
  providerStatus: number | null;
  providerResourceId: string | null;
  operationMeta: Record<string, string>;
  costUsd: number | null;
  estimatedCostUsd: number | null;
  creditsUsed: number | null;
  createdAt: string;
  updatedAt: string;
};

const nonnegative = z
  .union([z.number(), z.string().regex(/^\d+(\.\d+)?$/)])
  .transform(Number)
  .pipe(z.number().finite().nonnegative());
const count = nonnegative.pipe(z.number().int().safe());
const summarySchema = z.object({
  total: count,
  reported_gross_usd: nonnegative,
  reported_cost_count: count,
  no_response_recorded_usd: nonnegative,
  no_response_recorded_count: count,
  estimated_only_usd: nonnegative,
  estimated_only_count: count,
  no_receipt_or_estimate_count: count,
  unresolved_count: count,
  reported_credits: nonnegative,
  reported_credit_count: count,
});

/** Reject missing or malformed aggregate fields instead of presenting them as zero. */
export function parseVirloUsageSummary(value: unknown) {
  const s = summarySchema.parse(value);
  return {
    total: s.total,
    reportedUsd: s.reported_gross_usd,
    reportedCount: s.reported_cost_count,
    noResponseUsd: s.no_response_recorded_usd,
    noResponseCount: s.no_response_recorded_count,
    estimatedUsd: s.estimated_only_usd,
    estimatedCount: s.estimated_only_count,
    unknownCount: s.no_receipt_or_estimate_count,
    unresolvedCount: s.unresolved_count,
    reportedCredits: s.reported_credits,
    reportedCreditCount: s.reported_credit_count,
  };
}

const optionalNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** Expose only the known public tracking reference fields, never arbitrary payloads. */
export function safeVirloOperationMeta(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const obj = value as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const key of ["platform", "kind", "cadence", "status", "provider_id"]) {
    const item = obj[key];
    if (typeof item === "string" && /^[\w -]{1,100}$/.test(item))
      result[key] = item;
  }
  if (
    typeof obj["handle"] === "string" &&
    /^@?[\w.-]{1,100}$/.test(obj["handle"])
  )
    result["handle"] = obj["handle"];
  if (typeof obj["url"] === "string") {
    try {
      const url = new URL(obj["url"]);
      if (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.port &&
        /(^|\.)(tiktok\.com|instagram\.com|youtube\.com|youtu\.be)$/.test(
          url.hostname,
        )
      ) {
        url.search = "";
        url.hash = "";
        result["url"] = url.href.slice(0, 500);
      }
    } catch {
      /* Invalid or non-public references are not displayed. */
    }
  }
  return result;
}

export const listAdminVirloUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const auth = context as unknown as AuthContext;
    const role = await auth.supabase.rpc("has_role", {
      _user_id: auth.userId,
      _role: "super_admin",
    });
    if (role.error || !role.data)
      throw new Error("Super admin access required.");
    const { getAdminClient } = await import("./supabase-admin.server");
    const admin = getAdminClient();
    const db = admin as unknown as SupabaseClient<UsageSchema>;
    let query = db
      .from("virlo_research_activity")
      .select(
        "id,workspace_id,user_id,operation,status,provider_status,provider_resource_id,operation_meta,cost_usd,estimated_cost_usd,credits_used,created_at,updated_at",
        { count: "exact" },
      );
    if (data.workspaceId) query = query.eq("workspace_id", data.workspaceId);
    if (data.userId) query = query.eq("user_id", data.userId);
    if (data.operation) query = query.eq("operation", data.operation);
    if (data.status) query = query.eq("status", data.status);
    if (data.from)
      query = query.gte("created_at", `${data.from}T00:00:00.000Z`);
    let before: string | null = null;
    if (data.to) {
      const nextDay = new Date(`${data.to}T00:00:00.000Z`);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      before = nextDay.toISOString();
      query = query.lt("created_at", before);
    }
    const [recordsResult, summaryResult] = await Promise.all([
      query
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(data.page * 25, data.page * 25 + 24),
      db.rpc("virlo_usage_summary", {
        p_workspace_id: data.workspaceId ?? null,
        p_user_id: data.userId ?? null,
        p_operation: data.operation || null,
        p_status: data.status ?? null,
        p_from: data.from ? `${data.from}T00:00:00.000Z` : null,
        p_before: before,
      }),
    ]);
    const { data: records, error } = recordsResult;
    if (error)
      throw new Error(
        "Virlo usage could not be loaded. The usage ledger may not be configured yet.",
      );
    if (summaryResult.error || !summaryResult.data?.[0])
      throw new Error("Virlo usage totals could not be loaded.");
    const summary = parseVirloUsageSummary(summaryResult.data[0]);
    const raw = (records ?? []) as Record<string, unknown>[];
    const workspaceIds = [
      ...new Set(raw.map((r) => String(r["workspace_id"]))),
    ];
    const userIds = [
      ...new Set(
        raw
          .map((r) => (typeof r["user_id"] === "string" ? r["user_id"] : ""))
          .filter(Boolean),
      ),
    ];
    const [
      { data: workspaces, error: workspaceError },
      { data: profiles, error: profileError },
    ] = await Promise.all([
      workspaceIds.length
        ? admin.from("workspaces").select("id,name").in("id", workspaceIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length
        ? admin.from("profiles").select("id,full_name").in("id", userIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (workspaceError || profileError)
      throw new Error("Virlo usage names could not be loaded.");
    const workspaceNames = new Map(
      (workspaces ?? []).map((r) => [r.id, r.name]),
    );
    const profileNames = new Map(
      (profiles ?? []).map((r) => [r.id, r.full_name]),
    );
    const rows: VirloUsageRow[] = raw.map((r) => {
      const workspaceId = String(r["workspace_id"]),
        userId = typeof r["user_id"] === "string" ? r["user_id"] : "";
      return {
        id: String(r["id"]),
        workspaceId,
        workspaceName: workspaceNames.get(workspaceId) ?? "Unknown workspace",
        userId,
        userName: userId
          ? (profileNames.get(userId) ?? "Unknown user")
          : "Deleted user",
        operation: String(r["operation"]),
        status: String(r["status"]),
        providerStatus: optionalNumber(r["provider_status"]),
        providerResourceId:
          typeof r["provider_resource_id"] === "string"
            ? r["provider_resource_id"]
            : null,
        operationMeta: safeVirloOperationMeta(r["operation_meta"]),
        costUsd: optionalNumber(r["cost_usd"]),
        estimatedCostUsd: optionalNumber(r["estimated_cost_usd"]),
        creditsUsed: optionalNumber(r["credits_used"]),
        createdAt: String(r["created_at"]),
        updatedAt: String(r["updated_at"]),
      };
    });
    return { rows, total: summary.total, summary };
  });
