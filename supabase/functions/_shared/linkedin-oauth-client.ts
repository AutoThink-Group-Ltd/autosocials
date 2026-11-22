type AccountKind = "profile" | "company";

export function linkedInOAuthClient(
  kind: AccountKind,
  get: (name: string) => string | undefined,
) {
  if (kind === "company") {
    const id = get("LINKEDIN_COMPANY_CLIENT_ID")?.trim();
    const secret = get("LINKEDIN_COMPANY_SECRET")?.trim();
    if (id && secret) return { id, secret };
    if (id || secret)
      throw new Error(
        "LinkedIn Company Page authorization is only partially configured.",
      );
  }
  const id = get("LINKEDIN_CLIENT_ID")?.trim();
  const secret = get("LINKEDIN_SECRET")?.trim();
  if (!id || !secret) throw new Error("LinkedIn OAuth is not configured.");
  return { id, secret };
}
