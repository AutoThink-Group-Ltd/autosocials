export const IDEATION_PROGRESS_PREFIX = "Sam is working on four new narratives.";
export const IDEATION_WINDOW_MS = 7 * 60_000;

export function ideationIsActive(message: { content: string; created_at: string } | null | undefined, now = Date.now()): boolean {
  return !!message && message.content.startsWith(IDEATION_PROGRESS_PREFIX)
    && now - new Date(message.created_at).getTime() < IDEATION_WINDOW_MS;
}
