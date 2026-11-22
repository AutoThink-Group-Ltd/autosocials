import type {
  Block,
  RichResponse,
  AnswerEvidenceBlock,
  KpiCardsBlock,
  ActionRowBlock,
  NextBestActionBlock,
  ApprovalCardBlock,
  RecordPreviewBlock,
  TaskPreviewBlock,
  EmailPreviewBlock,
  FormBlock,
  MultiSourceViewBlock,
  TimelineSnapshotBlock,
  DataQualityPanelBlock,
  EmptyStateBlock,
  ErrorStateBlock,
  LoadingStateBlock,
  ComparisonStripBlock,
  DrillDownBlock,
  DocumentPreviewBlock,
  FilePreviewBlock,
  ReportPreviewBlock,
  ChecklistBlock,
  StatusPanelBlock,
  WorkflowStepsBlock,
} from "./types";
import { TextBlockView } from "./blocks/TextBlock";
import { HeadingBlockView } from "./blocks/HeadingBlock";
import { ListBlockView } from "./blocks/ListBlock";
import { KeyValueBlockView } from "./blocks/KeyValueBlock";
import { StatBlockView } from "./blocks/StatBlock";
import { ChartBlockView } from "./blocks/ChartBlock";
import { TableBlockView } from "./blocks/TableBlock";
import { CreatorCardBlockView } from "./blocks/CreatorCardBlock";
import { MessagePreviewBlockView } from "./blocks/MessagePreviewBlock";
import { ActionsBlockView, type ActionHandler } from "./blocks/ActionsBlock";
import { CalloutBlockView } from "./blocks/CalloutBlock";
import { BlockSkeleton } from "./BlockSkeleton";
import {
  AnswerEvidenceBlockView,
  KpiCardsBlockView,
  ActionRowBlockView,
  NextBestActionBlockView,
  ApprovalCardBlockView,
  RecordPreviewBlockView,
  TaskPreviewBlockView,
  EmailPreviewBlockView,
  FormBlockView,
  MultiSourceViewBlockView,
  TimelineSnapshotBlockView,
  DataQualityPanelBlockView,
  EmptyStateBlockView,
  ErrorStateBlockView,
  LoadingStateBlockView,
} from "./blocks/extra-blocks";
import {
  ComparisonStripBlockView,
  DrillDownBlockView,
  DocumentPreviewBlockView,
  FilePreviewBlockView,
  ReportPreviewBlockView,
  ChecklistBlockView,
  StatusPanelBlockView,
  WorkflowStepsBlockView,
} from "./blocks/portability-blocks";

export interface BlockRendererProps {
  response: RichResponse;
  /** Action protocol handler (Phase 4 wires confirmation gates). */
  onAction?: ActionHandler;
  /** When true, append a streaming skeleton after the rendered blocks. */
  isStreaming?: boolean;
}

/**
 * Top-level renderer for a validated rich response.
 * Walks blocks in order; unknown types render nothing rather than crash.
 */
export function BlockRenderer({ response, onAction, isStreaming }: BlockRendererProps) {
  return (
    <div className="space-y-3">
      {response.summary && (
        <div className="text-xs text-muted-foreground italic">{response.summary}</div>
      )}
      {response.blocks.map((block, i) => (
        <BlockSwitch key={i} block={block} {...(onAction !== undefined ? { onAction } : {})} />
      ))}
      {isStreaming && <BlockSkeleton />}
    </div>
  );
}

function BlockSwitch({ block, onAction }: { block: Block; onAction?: ActionHandler }) {
  const actionProps = onAction !== undefined ? { onAction } : {};
  switch (block.type) {
    case "text": return <TextBlockView block={block} />;
    case "heading": return <HeadingBlockView block={block} />;
    case "list": return <ListBlockView block={block} />;
    case "key_value": return <KeyValueBlockView block={block} />;
    case "stat": return <StatBlockView block={block} />;
    case "chart": return <ChartBlockView block={block} />;
    case "table": return <TableBlockView block={block} />;
    case "creator_card": return <CreatorCardBlockView block={block} />;
    case "message_preview": return <MessagePreviewBlockView block={block} />;
    case "actions": return <ActionsBlockView block={block} {...actionProps} />;
    case "callout": return <CalloutBlockView block={block} />;
    case "divider": return <hr className="border-border" />;
    case "answer_evidence": return <AnswerEvidenceBlockView block={block as AnswerEvidenceBlock} {...actionProps} />;
    case "kpi_cards": return <KpiCardsBlockView block={block as KpiCardsBlock} />;
    case "action_row": return <ActionRowBlockView block={block as ActionRowBlock} {...actionProps} />;
    case "next_best_action": return <NextBestActionBlockView block={block as NextBestActionBlock} {...actionProps} />;
    case "approval_card": return <ApprovalCardBlockView block={block as ApprovalCardBlock} {...actionProps} />;
    case "record_preview": return <RecordPreviewBlockView block={block as RecordPreviewBlock} {...actionProps} />;
    case "task_preview": return <TaskPreviewBlockView block={block as TaskPreviewBlock} {...actionProps} />;
    case "email_preview": return <EmailPreviewBlockView block={block as EmailPreviewBlock} {...actionProps} />;
    case "form": return <FormBlockView block={block as FormBlock} {...actionProps} />;
    case "multi_source_view": return <MultiSourceViewBlockView block={block as MultiSourceViewBlock} />;
    case "timeline_snapshot": return <TimelineSnapshotBlockView block={block as TimelineSnapshotBlock} />;
    case "data_quality_panel": return <DataQualityPanelBlockView block={block as DataQualityPanelBlock} />;
    case "empty_state": return <EmptyStateBlockView block={block as EmptyStateBlock} {...actionProps} />;
    case "error_state": return <ErrorStateBlockView block={block as ErrorStateBlock} {...actionProps} />;
    case "loading_state": return <LoadingStateBlockView block={block as LoadingStateBlock} />;
    case "comparison_strip": return <ComparisonStripBlockView block={block as ComparisonStripBlock} {...actionProps} />;
    case "drill_down": return <DrillDownBlockView block={block as DrillDownBlock} />;
    case "document_preview": return <DocumentPreviewBlockView block={block as DocumentPreviewBlock} {...actionProps} />;
    case "file_preview": return <FilePreviewBlockView block={block as FilePreviewBlock} {...actionProps} />;
    case "report_preview": return <ReportPreviewBlockView block={block as ReportPreviewBlock} {...actionProps} />;
    case "checklist": return <ChecklistBlockView block={block as ChecklistBlock} />;
    case "status_panel": return <StatusPanelBlockView block={block as StatusPanelBlock} />;
    case "workflow_steps": return <WorkflowStepsBlockView block={block as WorkflowStepsBlock} />;
    default: return null;
  }
}
