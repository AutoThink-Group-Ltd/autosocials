export const LINKEDIN_VERSION = "202610";
export const COMPANY_SCOPES = [
  "rw_organization_admin",
  "w_organization_social",
];
export const companyExternalId = (id: string) => `organization:${id}`;
export const companyIdFromExternal = (externalId: string) =>
  /^organization:([0-9]+)$/.exec(externalId)?.[1];

export const linkedInRestHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "X-Restli-Protocol-Version": "2.0.0",
  "Linkedin-Version": LINKEDIN_VERSION,
});

export async function getLinkedInCompanyAvatar(
  companyId: string,
  token: string,
  request = fetch,
): Promise<string | null> {
  const options: RequestInit = {
    headers: linkedInRestHeaders(token),
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  };
  try {
    const organization = await request(
      `https://api.linkedin.com/rest/organizations/${encodeURIComponent(companyId)}`,
      options,
    );
    if (!organization.ok) return null;
    const { logoV2 } = await organization.json();
    const assetId = [logoV2?.cropped, logoV2?.original]
      .filter((urn): urn is string => typeof urn === "string")
      .map(
        (urn) =>
          /^urn:li:(?:digitalmediaAsset|image):([a-z0-9_-]+)$/i.exec(urn)?.[1],
      )
      .find(Boolean);
    if (!assetId) return null;

    const image = await request(
      `https://api.linkedin.com/rest/images/urn:li:image:${assetId}`,
      options,
    );
    if (!image.ok) return null;
    const { downloadUrl } = await image.json();
    if (typeof downloadUrl !== "string") return null;
    const url = new URL(downloadUrl);
    const isLinkedInCdn = [".licdn.com", ".licdn-ei.com"].some((suffix) =>
      url.hostname.endsWith(suffix),
    );
    return url.protocol === "https:" &&
      isLinkedInCdn &&
      !url.username &&
      !url.password &&
      !url.port
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export type LinkedInPage = { id: string; name: string; vanity?: string };

export async function listLinkedInPages(
  token: string,
  request = fetch,
): Promise<LinkedInPage[]> {
  const headers = linkedInRestHeaders(token);
  const ids = new Set<string>();
  const count = 20;
  for (let start = 0; start < 200; start += count) {
    const params = new URLSearchParams({
      q: "roleAssignee",
      role: "ADMINISTRATOR",
      state: "APPROVED",
      count: String(count),
      start: String(start),
    });
    const response = await request(
      `https://api.linkedin.com/rest/organizationAcls?${params}`,
      {
        headers,
        signal: AbortSignal.timeout(15_000),
        redirect: "error",
      },
    );
    if (!response.ok)
      throw new Error(
        "LinkedIn could not list your Company Pages. Check the app’s Community Management access and your Page admin role.",
      );
    const body = await response.json();
    if (!Array.isArray(body?.elements))
      throw new Error("LinkedIn returned an invalid list of Company Pages.");
    for (const item of body.elements) {
      const id = /^urn:li:organization:([0-9]+)$/.exec(
        item?.organization ?? item?.organizationTarget ?? "",
      )?.[1];
      if (id && item.role === "ADMINISTRATOR" && item.state === "APPROVED")
        ids.add(id);
    }
    if (body.elements.length < count) break;
  }
  const pages: LinkedInPage[] = [];
  const idsToLoad = [...ids];
  for (let offset = 0; offset < idsToLoad.length; offset += 5) {
    const results = await Promise.all(
      idsToLoad.slice(offset, offset + 5).map(async (id) => {
        const response = await request(
          `https://api.linkedin.com/rest/organizations/${id}`,
          {
            headers,
            signal: AbortSignal.timeout(15_000),
            redirect: "error",
          },
        );
        if (response.status === 403 || response.status === 404) return null;
        if (!response.ok)
          throw new Error(
            "LinkedIn could not identify your Company Pages. Please try connecting again.",
          );
        const page = await response.json();
        if (
          typeof page?.localizedName !== "string" ||
          !page.localizedName.trim()
        )
          return null;
        return {
          id,
          name: page.localizedName.trim().slice(0, 180),
          ...(typeof page.vanityName === "string" &&
          /^[a-z0-9-]+$/i.test(page.vanityName)
            ? { vanity: page.vanityName }
            : {}),
        };
      }),
    );
    for (const page of results) if (page) pages.push(page);
  }
  return pages.sort((a, b) => a.name.localeCompare(b.name));
}
