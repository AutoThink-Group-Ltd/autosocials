import { createHash } from "node:crypto";

/** Hash transient media URL too, so changed media invalidates a cached observation. */
export function personalMediaFingerprint(profile: string, postUrl: string, date: string | null, caption: string, mediaUrl: string, duration: number | null): string {
  return createHash("sha256").update(JSON.stringify(["personal-media-v1", profile, postUrl, date, caption, mediaUrl, duration])).digest("hex");
}

export function findCachedPersonalMedia(previous: string, profile: string, postUrl: string, fingerprint: string): { visual?: string; transcript?: string } | null {
  const sections = previous.split(/\n\n(?=Profile: )/);
  const section = sections.find((part) => part.match(/(?:^|\n)Profile: (.+)/)?.[1] === profile);
  if (!section) return null;
  const post = [...section.matchAll(/^- (\S+|Date unavailable) (https:\/\/\S+)\n([\s\S]*?)(?=\n- (?:\S+|Date unavailable) https:\/\/|(?![\s\S]))/gm)].find((match) => match[2] === postUrl)?.[3];
  if (!post || !post.split("\n").includes(`  Media cache v1: ${fingerprint}`)) return null;
  const visual = post.match(/^  Visual observation \((?:sampled frames|image)\): (.{1,1200})$/m)?.[0];
  const transcript = post.match(/^  Transcript \(audio sample\): (.{1,6000})$/m)?.[0];
  return visual || transcript ? { ...(visual ? { visual } : {}), ...(transcript ? { transcript } : {}) } : null;
}

/** Keep provider text on one line so it cannot create synthetic evidence records. */
export const safePersonalCaption = (text: string) => text.slice(0, 3000).replace(/\s+/g, " ").trim();
