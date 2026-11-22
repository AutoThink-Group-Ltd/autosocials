// Phase 1 — Rich Agent Chat UX foundation
// Type contracts for Vibe's structured response blocks.
// Renderers and planner come in later phases; this file is the source of truth.

import { z } from "zod";

// ---------- Block schemas ----------

export const TextBlockSchema = z.object({
  type: z.literal("text"),
  body: z.string().min(1),
  tone: z.enum(["neutral", "positive", "warning", "critical"]).optional(),
});

export const HeadingBlockSchema = z.object({
  type: z.literal("heading"),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  body: z.string().min(1),
});

export const ListBlockSchema = z.object({
  type: z.literal("list"),
  ordered: z.boolean().default(false),
  items: z.array(z.string().min(1)).min(1).max(20),
});

export const KeyValueBlockSchema = z.object({
  type: z.literal("key_value"),
  title: z.string().optional(),
  pairs: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .min(1)
    .max(20),
});

export const StatBlockSchema = z.object({
  type: z.literal("stat"),
  stats: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
        delta: z.string().optional(),
        trend: z.enum(["up", "down", "flat"]).optional(),
      }),
    )
    .min(1)
    .max(6),
});

export const ChartBlockSchema = z.object({
  type: z.literal("chart"),
  chart: z.enum(["line", "bar", "area", "pie"]),
  title: z.string().optional(),
  xKey: z.string(),
  series: z.array(z.string()).min(1).max(6),
  data: z.array(z.record(z.union([z.string(), z.number()]))).min(1).max(200),
});

export const TableBlockSchema = z.object({
  type: z.literal("table"),
  title: z.string().optional(),
  columns: z.array(z.object({ key: z.string(), label: z.string() })).min(1).max(8),
  rows: z.array(z.record(z.union([z.string(), z.number(), z.null()]))).min(1).max(100),
});

export const CreatorCardBlockSchema = z.object({
  type: z.literal("creator_card"),
  creator: z.object({
    handle: z.string(),
    platform: z.enum(["tiktok", "instagram"]),
    displayName: z.string().optional(),
    avatarUrl: z.string().url().optional(),
    followers: z.number().optional(),
    engagementRate: z.number().optional(),
    bio: z.string().optional(),
    creatorId: z.string().optional(),
  }),
});

export const MessagePreviewBlockSchema = z.object({
  type: z.literal("message_preview"),
  channel: z.enum(["instagram_dm", "tiktok_dm", "email"]).default("instagram_dm"),
  to: z.object({ handle: z.string(), avatarUrl: z.string().url().optional() }),
  subject: z.string().optional(),
  body: z.string().min(1).max(2000),
});

export const ActionButtonSchema = z.object({
  label: z.string().min(1).max(40),
  // Action id resolved by the host UI's action protocol (Phase 4).
  action: z.string().min(1),
  // Optional payload passed to the action handler.
  payload: z.record(z.unknown()).optional(),
  variant: z.enum(["primary", "secondary", "ghost", "destructive"]).default("primary"),
  // True when this action mutates state, sends, charges or publishes.
  requiresConfirmation: z.boolean().default(false),
  // Phase 7 (G3): explicit risk classification consumed by the dispatcher.
  // `high` and `destructive` enqueue an approval row before execution.
  riskLevel: z.enum(["low", "medium", "high", "destructive"]).optional(),
  confirmationMessage: z.string().max(280).optional(),
  optimistic: z.boolean().optional(),
});

export const ActionsBlockSchema = z.object({
  type: z.literal("actions"),
  actions: z.array(ActionButtonSchema).min(1).max(4),
});

export const CalloutBlockSchema = z.object({
  type: z.literal("callout"),
  intent: z.enum(["info", "success", "warning", "danger"]).default("info"),
  title: z.string().optional(),
  body: z.string().min(1),
});

export const DividerBlockSchema = z.object({ type: z.literal("divider") });

// ---------- Phase 7 (G2) — additional block types ----------

const SourceSchema = z.object({
  label: z.string(),
  url: z.string().url().optional(),
  freshness: z.string().optional(),
});

export const AnswerEvidenceBlockSchema = z.object({
  type: z.literal("answer_evidence"),
  answer: z.string().min(1).max(2000),
  reasoning: z.string().max(2000).optional(),
  evidence: z.array(z.string().min(1)).max(10).optional(),
  sources: z.array(SourceSchema).max(10).optional(),
  confidence: z.enum(["low", "medium", "high"]).optional(),
  suggestedNextAction: ActionButtonSchema.optional(),
});

export const KpiCardsBlockSchema = z.object({
  type: z.literal("kpi_cards"),
  cards: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
        delta: z.string().optional(),
        trend: z.enum(["up", "down", "flat"]).optional(),
        status: z.enum(["positive", "neutral", "warning", "critical"]).optional(),
      }),
    )
    .min(1)
    .max(6),
});

export const ActionRowBlockSchema = z.object({
  type: z.literal("action_row"),
  prompt: z.string().max(280).optional(),
  actions: z.array(ActionButtonSchema).min(1).max(4),
});

export const NextBestActionBlockSchema = z.object({
  type: z.literal("next_best_action"),
  title: z.string().max(120),
  rationale: z.string().max(400).optional(),
  action: ActionButtonSchema,
});

export const ApprovalCardBlockSchema = z.object({
  type: z.literal("approval_card"),
  title: z.string().max(120),
  summary: z.string().max(400),
  riskLevel: z.enum(["high", "destructive"]).default("high"),
  approve: ActionButtonSchema,
  reject: ActionButtonSchema.optional(),
});

export const RecordPreviewBlockSchema = z.object({
  type: z.literal("record_preview"),
  entity: z.enum(["creator", "list", "campaign", "client", "workspace", "other"]),
  title: z.string(),
  subtitle: z.string().optional(),
  fields: z.array(z.object({ label: z.string(), value: z.string() })).min(1).max(12),
  actions: z.array(ActionButtonSchema).max(4).optional(),
});

export const TaskPreviewBlockSchema = z.object({
  type: z.literal("task_preview"),
  title: z.string(),
  description: z.string().optional(),
  dueAt: z.string().optional(),
  assignee: z.string().optional(),
  status: z.enum(["todo", "in_progress", "done", "blocked"]).default("todo"),
  actions: z.array(ActionButtonSchema).max(3).optional(),
});

export const EmailPreviewBlockSchema = z.object({
  type: z.literal("email_preview"),
  to: z.string(),
  from: z.string().optional(),
  subject: z.string(),
  body: z.string().min(1).max(8000),
  actions: z.array(ActionButtonSchema).max(3).optional(),
});

export const FormFieldSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), name: z.string(), label: z.string(), placeholder: z.string().optional(), required: z.boolean().optional() }),
  z.object({ kind: z.literal("textarea"), name: z.string(), label: z.string(), placeholder: z.string().optional(), required: z.boolean().optional() }),
  z.object({ kind: z.literal("number"), name: z.string(), label: z.string(), min: z.number().optional(), max: z.number().optional(), required: z.boolean().optional() }),
  z.object({ kind: z.literal("select"), name: z.string(), label: z.string(), options: z.array(z.object({ label: z.string(), value: z.string() })).min(1).max(20), required: z.boolean().optional() }),
  z.object({ kind: z.literal("toggle"), name: z.string(), label: z.string() }),
  z.object({ kind: z.literal("date"), name: z.string(), label: z.string(), required: z.boolean().optional() }),
]);

export const FormBlockSchema = z.object({
  type: z.literal("form"),
  title: z.string().optional(),
  description: z.string().optional(),
  submitLabel: z.string().max(40).default("Submit"),
  submitAction: z.string().min(1),
  fields: z.array(FormFieldSchema).min(1).max(8),
});

export const MultiSourceViewBlockSchema = z.object({
  type: z.literal("multi_source_view"),
  sourcesUsed: z.array(SourceSchema).max(8).optional(),
  sourcesUnavailable: z.array(z.string()).max(8).optional(),
  lastUpdated: z.string().optional(),
  completeness: z.number().min(0).max(1).optional(),
  isPartial: z.boolean().optional(),
});

export const TimelineSnapshotBlockSchema = z.object({
  type: z.literal("timeline_snapshot"),
  title: z.string().optional(),
  events: z
    .array(
      z.object({
        timestamp: z.string(),
        actor: z.string().optional(),
        eventType: z.string(),
        description: z.string(),
        importance: z.enum(["low", "normal", "high"]).optional(),
      }),
    )
    .min(1)
    .max(20),
});

export const DataQualityPanelBlockSchema = z.object({
  type: z.literal("data_quality_panel"),
  completeness: z.number().min(0).max(1).optional(),
  freshness: z.string().optional(),
  gaps: z.array(z.string()).max(10).optional(),
  suggestedFixes: z.array(z.string()).max(6).optional(),
});

export const EmptyStateBlockSchema = z.object({
  type: z.literal("empty_state"),
  title: z.string(),
  body: z.string().optional(),
  action: ActionButtonSchema.optional(),
});

export const ErrorStateBlockSchema = z.object({
  type: z.literal("error_state"),
  title: z.string(),
  body: z.string().optional(),
  retryAction: ActionButtonSchema.optional(),
});

export const LoadingStateBlockSchema = z.object({
  type: z.literal("loading_state"),
  label: z.string().optional(),
});

// ---------- Phase 8 (G6) — niche/portability blocks ----------

export const ComparisonStripBlockSchema = z.object({
  type: z.literal("comparison_strip"),
  title: z.string().optional(),
  entities: z
    .array(
      z.object({
        name: z.string(),
        keyMetric: z.string().optional(),
        trend: z.enum(["up", "down", "flat"]).optional(),
        strengths: z.array(z.string()).max(5).optional(),
        weaknesses: z.array(z.string()).max(5).optional(),
        recommended: z.boolean().optional(),
        action: ActionButtonSchema.optional(),
      }),
    )
    .min(2)
    .max(4),
});

export const DrillDownBlockSchema = z.object({
  type: z.literal("drill_down"),
  title: z.string().optional(),
  layers: z
    .array(
      z.object({
        label: z.enum(["summary", "detail", "source", "raw"]),
        body: z.string().min(1).max(2000),
      }),
    )
    .min(2)
    .max(4),
});

export const DocumentPreviewBlockSchema = z.object({
  type: z.literal("document_preview"),
  title: z.string(),
  subtitle: z.string().optional(),
  body: z.string().min(1).max(8000),
  actions: z.array(ActionButtonSchema).max(3).optional(),
});

export const FilePreviewBlockSchema = z.object({
  type: z.literal("file_preview"),
  filename: z.string(),
  mimeType: z.string().optional(),
  sizeBytes: z.number().optional(),
  url: z.string().url().optional(),
  caption: z.string().optional(),
  actions: z.array(ActionButtonSchema).max(3).optional(),
});

export const ReportPreviewBlockSchema = z.object({
  type: z.literal("report_preview"),
  title: z.string(),
  period: z.string().optional(),
  highlights: z.array(z.string()).min(1).max(8),
  metrics: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .max(8)
    .optional(),
  actions: z.array(ActionButtonSchema).max(3).optional(),
});

export const ChecklistBlockSchema = z.object({
  type: z.literal("checklist"),
  title: z.string().optional(),
  items: z
    .array(
      z.object({
        label: z.string(),
        done: z.boolean().default(false),
        hint: z.string().optional(),
      }),
    )
    .min(1)
    .max(20),
});

export const StatusPanelBlockSchema = z.object({
  type: z.literal("status_panel"),
  title: z.string().optional(),
  status: z.enum(["healthy", "degraded", "warning", "critical", "unknown"]),
  summary: z.string().max(400).optional(),
  signals: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .max(8)
    .optional(),
});

export const WorkflowStepsBlockSchema = z.object({
  type: z.literal("workflow_steps"),
  title: z.string().optional(),
  steps: z
    .array(
      z.object({
        label: z.string(),
        status: z.enum(["todo", "active", "done", "blocked"]).default("todo"),
        hint: z.string().optional(),
      }),
    )
    .min(2)
    .max(8),
});

// ---------- Discriminated union ----------

export const BlockSchema = z.discriminatedUnion("type", [
  TextBlockSchema,
  HeadingBlockSchema,
  ListBlockSchema,
  KeyValueBlockSchema,
  StatBlockSchema,
  ChartBlockSchema,
  TableBlockSchema,
  CreatorCardBlockSchema,
  MessagePreviewBlockSchema,
  ActionsBlockSchema,
  CalloutBlockSchema,
  DividerBlockSchema,
  AnswerEvidenceBlockSchema,
  KpiCardsBlockSchema,
  ActionRowBlockSchema,
  NextBestActionBlockSchema,
  ApprovalCardBlockSchema,
  RecordPreviewBlockSchema,
  TaskPreviewBlockSchema,
  EmailPreviewBlockSchema,
  FormBlockSchema,
  MultiSourceViewBlockSchema,
  TimelineSnapshotBlockSchema,
  DataQualityPanelBlockSchema,
  EmptyStateBlockSchema,
  ErrorStateBlockSchema,
  LoadingStateBlockSchema,
  ComparisonStripBlockSchema,
  DrillDownBlockSchema,
  DocumentPreviewBlockSchema,
  FilePreviewBlockSchema,
  ReportPreviewBlockSchema,
  ChecklistBlockSchema,
  StatusPanelBlockSchema,
  WorkflowStepsBlockSchema,
]);

// ---------- Response-level metadata (G1) ----------

export const ResponseMetadataSchema = z.object({
  confidence: z.enum(["low", "medium", "high"]).optional(),
  dataFreshness: z.string().optional(),
  sourcesUsed: z.array(z.string()).optional(),
  sourcesUnavailable: z.array(z.string()).optional(),
  isPartialAnswer: z.boolean().optional(),
  requiresUserConfirmation: z.boolean().optional(),
  fallbackText: z.string().optional(),
});

export const PresentationTypeSchema = z.enum([
  "plain_text",
  "answer_with_evidence",
  "kpi_summary",
  "smart_table",
  "chart_summary",
  "comparison",
  "timeline",
  "source_breakdown",
  "preview",
  "form_request",
  "action_panel",
  "workflow_status",
  "mixed_response",
]);

export const RichResponseSchema = z.object({
  // Schema version, bumped when the contract changes.
  v: z.literal(1),
  // Optional one-line summary the chat shell can show in the message header.
  summary: z.string().max(160).optional(),
  // Ordered blocks. The renderer walks this array top-to-bottom.
  blocks: z.array(BlockSchema).min(1).max(40),
  messageId: z.string().max(80).optional(),
  presentationType: PresentationTypeSchema.optional(),
  metadata: ResponseMetadataSchema.optional(),
});

// ---------- Inferred TypeScript types ----------

export type TextBlock = z.infer<typeof TextBlockSchema>;
export type HeadingBlock = z.infer<typeof HeadingBlockSchema>;
export type ListBlock = z.infer<typeof ListBlockSchema>;
export type KeyValueBlock = z.infer<typeof KeyValueBlockSchema>;
export type StatBlock = z.infer<typeof StatBlockSchema>;
export type ChartBlock = z.infer<typeof ChartBlockSchema>;
export type TableBlock = z.infer<typeof TableBlockSchema>;
export type CreatorCardBlock = z.infer<typeof CreatorCardBlockSchema>;
export type MessagePreviewBlock = z.infer<typeof MessagePreviewBlockSchema>;
export type ActionsBlock = z.infer<typeof ActionsBlockSchema>;
export type CalloutBlock = z.infer<typeof CalloutBlockSchema>;
export type DividerBlock = z.infer<typeof DividerBlockSchema>;
export type AnswerEvidenceBlock = z.infer<typeof AnswerEvidenceBlockSchema>;
export type KpiCardsBlock = z.infer<typeof KpiCardsBlockSchema>;
export type ActionRowBlock = z.infer<typeof ActionRowBlockSchema>;
export type NextBestActionBlock = z.infer<typeof NextBestActionBlockSchema>;
export type ApprovalCardBlock = z.infer<typeof ApprovalCardBlockSchema>;
export type RecordPreviewBlock = z.infer<typeof RecordPreviewBlockSchema>;
export type TaskPreviewBlock = z.infer<typeof TaskPreviewBlockSchema>;
export type EmailPreviewBlock = z.infer<typeof EmailPreviewBlockSchema>;
export type FormBlock = z.infer<typeof FormBlockSchema>;
export type MultiSourceViewBlock = z.infer<typeof MultiSourceViewBlockSchema>;
export type TimelineSnapshotBlock = z.infer<typeof TimelineSnapshotBlockSchema>;
export type DataQualityPanelBlock = z.infer<typeof DataQualityPanelBlockSchema>;
export type EmptyStateBlock = z.infer<typeof EmptyStateBlockSchema>;
export type ErrorStateBlock = z.infer<typeof ErrorStateBlockSchema>;
export type LoadingStateBlock = z.infer<typeof LoadingStateBlockSchema>;
export type ComparisonStripBlock = z.infer<typeof ComparisonStripBlockSchema>;
export type DrillDownBlock = z.infer<typeof DrillDownBlockSchema>;
export type DocumentPreviewBlock = z.infer<typeof DocumentPreviewBlockSchema>;
export type FilePreviewBlock = z.infer<typeof FilePreviewBlockSchema>;
export type ReportPreviewBlock = z.infer<typeof ReportPreviewBlockSchema>;
export type ChecklistBlock = z.infer<typeof ChecklistBlockSchema>;
export type StatusPanelBlock = z.infer<typeof StatusPanelBlockSchema>;
export type WorkflowStepsBlock = z.infer<typeof WorkflowStepsBlockSchema>;
export type FormField = z.infer<typeof FormFieldSchema>;
export type ResponseMetadata = z.infer<typeof ResponseMetadataSchema>;
export type PresentationType = z.infer<typeof PresentationTypeSchema>;
export type ActionButton = z.infer<typeof ActionButtonSchema>;
export type Block = z.infer<typeof BlockSchema>;
export type RichResponse = z.infer<typeof RichResponseSchema>;

export const BLOCK_TYPES = [
  "text",
  "heading",
  "list",
  "key_value",
  "stat",
  "chart",
  "table",
  "creator_card",
  "message_preview",
  "actions",
  "callout",
  "divider",
  "answer_evidence",
  "kpi_cards",
  "action_row",
  "next_best_action",
  "approval_card",
  "record_preview",
  "task_preview",
  "email_preview",
  "form",
  "multi_source_view",
  "timeline_snapshot",
  "data_quality_panel",
  "empty_state",
  "error_state",
  "loading_state",
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

// ---------- Parsing helpers ----------

export type ParseResult =
  | { ok: true; response: RichResponse }
  | { ok: false; error: string; issues?: z.ZodIssue[] };

/**
 * Parse and validate a rich-response payload.
 * Accepts either a parsed object or a JSON string.
 * Never throws — returns a discriminated result so the renderer can
 * fall back to plain text when validation fails.
 */
export function parseRichResponse(input: unknown): ParseResult {
  let candidate: unknown = input;
  if (typeof input === "string") {
    try {
      candidate = JSON.parse(input);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Invalid JSON" };
    }
  }
  const result = RichResponseSchema.safeParse(candidate);
  if (!result.success) {
    return { ok: false, error: "Schema validation failed", issues: result.error.issues };
  }
  return { ok: true, response: result.data };
}

/**
 * Extract a fenced ```json ... ``` block from streamed assistant text,
 * if one exists. Used by the planner in later phases to detect
 * structured payloads inside otherwise free-form responses.
 */
export function extractFencedJson(text: string): string | null {
  const match = text.match(/```json\s*([\s\S]*?)```/i);
  return match?.[1] ? match[1].trim() : null;
}