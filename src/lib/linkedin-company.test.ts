import { expect, it, vi } from "vitest";
import {
  COMPANY_SCOPES,
  getLinkedInCompanyAvatar,
  listLinkedInPages,
} from "../../supabase/functions/_shared/linkedin-company";
import { hasRequiredLinkedInScopes } from "../../supabase/functions/_shared/linkedin-scopes";
import { linkedInOAuthClient } from "../../supabase/functions/_shared/linkedin-oauth-client";

it("resolves the cropped Company Page logo to a LinkedIn CDN URL", async () => {
  const downloadUrl = "https://media.licdn.com/dms/image/example?e=1795718400";
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        logoV2: {
          cropped: "urn:li:digitalmediaAsset:logo_cropped",
          original: "urn:li:image:logo_original",
        },
      }),
    )
    .mockResolvedValueOnce(Response.json({ downloadUrl }));

  await expect(getLinkedInCompanyAvatar("123", "token", request)).resolves.toBe(
    downloadUrl,
  );
  expect(request.mock.calls.map(([url]) => url)).toEqual([
    "https://api.linkedin.com/rest/organizations/123",
    "https://api.linkedin.com/rest/images/urn:li:image:logo_cropped",
  ]);
  expect(
    new Headers(request.mock.calls[1][1]?.headers).get("Authorization"),
  ).toBe("Bearer token");
});

it("keeps the default avatar if a Page has no logo or LinkedIn cannot supply it", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({}))
    .mockResolvedValueOnce(
      Response.json({ logoV2: { original: "urn:li:image:logo" } }),
    )
    .mockResolvedValueOnce(
      Response.json({
        downloadUrl: "https://media.licdn.com.example.com/logo",
      }),
    );

  await expect(
    getLinkedInCompanyAvatar("123", "token", request),
  ).resolves.toBeNull();
  expect(request).toHaveBeenCalledTimes(1);
  await expect(
    getLinkedInCompanyAvatar("123", "token", request),
  ).resolves.toBeNull();
});

it("only offers approved Pages that LinkedIn identifies for the authenticated administrator", async () => {
  const request = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer token",
      );
      if (url.pathname.endsWith("/organizationAcls")) {
        expect(Object.fromEntries(url.searchParams)).toMatchObject({
          q: "roleAssignee",
          role: "ADMINISTRATOR",
          state: "APPROVED",
        });
        return Response.json({
          elements: [
            {
              organization: "urn:li:organization:123",
              role: "ADMINISTRATOR",
              state: "APPROVED",
            },
            {
              organization: "urn:li:organization:123",
              role: "ADMINISTRATOR",
              state: "APPROVED",
            },
            {
              organization: "urn:li:organization:999",
              role: "ADMINISTRATOR",
              state: "REQUESTED",
            },
            {
              organization: "urn:li:organization:888",
              role: "ANALYST",
              state: "APPROVED",
            },
          ],
        });
      }
      expect(url.pathname).toBe("/rest/organizations/123");
      return Response.json({
        localizedName: "AutoTill",
        vanityName: "autotill",
      });
    },
  );
  await expect(listLinkedInPages("token", request)).resolves.toEqual([
    { id: "123", name: "AutoTill", vanity: "autotill" },
  ]);
  expect(request).toHaveBeenCalledTimes(2);
});

it("rejects member-only grants for company connections", () => {
  expect(
    hasRequiredLinkedInScopes("openid profile w_member_social", COMPANY_SCOPES),
  ).toBe(false);
  expect(
    hasRequiredLinkedInScopes(
      "rw_organization_admin,w_organization_social",
      COMPANY_SCOPES,
    ),
  ).toBe(true);
});

it("uses the Community application only for Company Page authorization", () => {
  const settings: Record<string, string> = {
    LINKEDIN_CLIENT_ID: "member-id",
    LINKEDIN_SECRET: "member-secret",
    LINKEDIN_COMPANY_CLIENT_ID: "company-id",
    LINKEDIN_COMPANY_SECRET: "company-secret",
  };
  const get = (name: string) => settings[name];
  expect(linkedInOAuthClient("profile", get)).toEqual({
    id: "member-id",
    secret: "member-secret",
  });
  expect(linkedInOAuthClient("company", get)).toEqual({
    id: "company-id",
    secret: "company-secret",
  });
  delete settings["LINKEDIN_COMPANY_SECRET"];
  expect(() => linkedInOAuthClient("company", get)).toThrow(
    "partially configured",
  );
});
