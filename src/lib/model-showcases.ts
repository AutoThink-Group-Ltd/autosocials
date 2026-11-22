/** First-party Higgsfield showcase media, separate from the generated API catalogue. */
export type ModelShowcase = { video: string; poster: string; source: string; scope: "family" };

export const MODEL_SHOWCASES: Record<string, ModelShowcase> = {
  "Kling 3.0": {
    video: "https://static.higgsfield.ai/kling-3/examples/highlight-1.mp4",
    poster: "https://static.higgsfield.ai/kling-3/examples/highlight-1-thumbnail.webp",
    source: "https://higgsfield.ai/kling-3.0", scope: "family",
  },
  "Seedance 2.5": {
    video: "https://static.higgsfield.ai/seedance-2.5/v2/hero/video-3.mp4?v=20260807",
    poster: "https://static.higgsfield.ai/seedance-2.5/v2/hero/video-3-thumbnail.webp",
    source: "https://higgsfield.ai/seedance/2.5", scope: "family",
  },
  "MiniMax H3": {
    video: "https://static.higgsfield.ai/minimax-h3/text-mini.mp4",
    poster: "https://static.higgsfield.ai/minimax-h3/text-mini-thumbnail.webp",
    source: "https://higgsfield.ai/minimax/h3", scope: "family",
  },
  "Wan 2.6": {
    video: "https://static.higgsfield.ai/wan-2.6/hero-mini.mp4",
    poster: "https://static.higgsfield.ai/wan-2.6/case-1-mini-thumbnail.webp",
    source: "https://higgsfield.ai/wan-2.6", scope: "family",
  },
  "Grok Imagine Video 1.5": {
    video: "https://static.higgsfield.ai/grok-imagine-1.5/hero-mini.mp4",
    poster: "https://static.higgsfield.ai/grok-imagine-1.5/hero-mini-thumbnail.webp",
    source: "https://higgsfield.ai/grok-imagine-1.5", scope: "family",
  },
};
