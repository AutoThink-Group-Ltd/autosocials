import { parseClientSocialProfile } from "./client-social-profiles";

/** Reuse only sections from a snapshot of exactly the currently saved profiles. */
export function reusablePersonalSections(content: string, urls: string[]): Map<string, string> | null {
  if (!content.startsWith(`Selected profiles: ${urls.join(" | ")}\n`)) return null;
  const sections = content.split(/\n\n(?=Profile: )/);
  const result = new Map<string, string>();
  for (const section of sections) {
    const start = section.search(/(?:^|\n)Profile: /);
    if (start < 0) continue;
    const body = section.slice(start).trimStart();
    const url = body.match(/^Profile: (.+)$/m)?.[1];
    const found = url ? parseClientSocialProfile(url) : null;
    const matching = found && urls.filter((saved) => {
      const profile = parseClientSocialProfile(saved);
      return profile?.platform === found.platform && profile.handle.toLowerCase() === found.handle.toLowerCase();
    });
    if (matching?.length === 1) result.set(matching[0]!, body);
  }
  return urls.every((url) => result.has(url)) ? result : null;
}
