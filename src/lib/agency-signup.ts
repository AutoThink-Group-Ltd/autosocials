import { z } from "zod";

/** Adds https:// when missing and lowercases the host. Returns null if not a valid web address. */
export function normalizeWebsite(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(u.hostname)) return null;
    const out = u.toString().replace(/\/$/, "");
    return out.length > 255 ? null : out;
  } catch {
    return null;
  }
}

const schema = z.object({
  agencyName: z.string().trim().min(2, "Agency name must be at least 2 characters").max(100, "Agency name must be under 100 characters"),
  agencyWebsite: z.string().trim().min(1, "Agency website is required"),
});

export function validateAgencyDetails(agencyName: string, agencyWebsite: string):
  { ok: true; agency_name: string; agency_website: string } | { ok: false; error: string } {
  const r = schema.safeParse({ agencyName, agencyWebsite });
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "Check your agency details" };
  const site = normalizeWebsite(r.data.agencyWebsite);
  if (!site) return { ok: false, error: "Enter a valid agency website, e.g. youragency.com" };
  return { ok: true, agency_name: r.data.agencyName, agency_website: site };
}
