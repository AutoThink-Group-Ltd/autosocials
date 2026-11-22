import { zonesFor } from "./safe-zones";

/**
 * Render a reaction against the customer's actual recording. Both clips are
 * muted: the renderer receives the same narration file used to drive the
 * avatar, starting at time zero. Durations must be measured, not inferred
 * from a filename or a proposed script.
 */
export function reactionComposition(input: {
  width: number;
  height: number;
  duration: number;
  demoPath: string;
  demoSeconds: number;
  avatarPath: string;
  avatarSeconds: number;
  narrationSeconds: number;
}): string {
  const { width, height, duration, demoPath, demoSeconds, avatarPath, avatarSeconds, narrationSeconds } = input;
  if (![width, height].every((n) => Number.isInteger(n) && n >= 320 && n <= 4096)
    || !Number.isFinite(duration) || duration <= 0 || duration > 60
    || !Number.isFinite(demoSeconds) || demoSeconds < 1
    || !Number.isFinite(avatarSeconds) || !Number.isFinite(narrationSeconds)
    || narrationSeconds <= 0 || narrationSeconds > duration || avatarSeconds + 0.1 < narrationSeconds) {
    throw new Error("Reaction video needs verified compatible media durations and dimensions.");
  }
  const safePath = (path: string) => /^(?:assets|generated)\/[a-zA-Z0-9_./-]+$/.test(path)
    && !path.split("/").some((part) => !part || part === "." || part === "..");
  if (!safePath(demoPath) || !safePath(avatarPath) || demoPath === avatarPath) {
    throw new Error("Reaction video needs two distinct local project media files.");
  }
  const zones = zonesFor(width, height);
  const left = zones.safe.left;
  const top = zones.working[0];
  const areaWidth = zones.safe.right - left;
  const areaHeight = zones.working[1] - top;
  const gap = Math.max(8, Math.round(areaWidth * 0.02));
  // Preserve space for the actual demo and leave the caption strip clear.
  const demoWidth = Math.floor((areaWidth - gap) * 0.67);
  const avatarWidth = areaWidth - gap - demoWidth;
  const avatarLeft = left + demoWidth + gap;
  const f = (n: number) => Number(n.toFixed(3)).toString();
  const clips: string[] = [];
  for (let start = 0, i = 0; start < duration - 0.0001; i++) {
    const length = Math.min(demoSeconds, duration - start);
    clips.push(`<video id="demo${i}" class="clip demo" data-start="${f(start)}" data-duration="${f(length)}" data-track-index="0" data-media-start="0" src="${demoPath}" muted playsinline></video>`);
    start += length;
  }
  return `<!doctype html><html><head><meta charset="UTF-8"><script src="gsap.min.js"></script><style>
html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:#111}
#root{position:relative;width:100%;height:100%;overflow:hidden}
.demo{position:absolute;left:${left}px;top:${top}px;width:${demoWidth}px;height:${areaHeight}px;object-fit:contain;background:#111}
.avatar{position:absolute;left:${avatarLeft}px;top:${top}px;width:${avatarWidth}px;height:${areaHeight}px;object-fit:contain;background:#111}
</style></head><body><div id="root" data-composition-id="main" data-start="0" data-duration="${f(duration)}" data-width="${width}" data-height="${height}">
${clips.join("\n")}
<video id="avatar" class="clip avatar" data-start="0" data-duration="${f(Math.min(narrationSeconds, avatarSeconds))}" data-track-index="1" data-media-start="0" src="${avatarPath}" muted playsinline></video>
</div><script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});window.__timelines["main"]=tl;tl.seek(0);</script></body></html>`;
}
