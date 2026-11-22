import { defineConfig } from "nitro/config";

// The Research video sampler needs the platform FFmpeg executable in the server bundle.
export default defineConfig({
  // Fontkit loads the Unicode property trie relative to its package at runtime.
  traceDeps: ["ffmpeg-static*", "fontkit*", "unicode-properties*"],
  traceOpts: { chmod: true },
});
