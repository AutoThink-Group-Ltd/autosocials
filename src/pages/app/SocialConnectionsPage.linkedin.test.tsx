import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import SocialConnectionsPage from "./SocialConnectionsPage";

const { invoke, list } = vi.hoisted(() => ({ invoke: vi.fn(), list: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ order: list }) }) }),
    functions: { invoke },
  },
}));

it("confirms the selected profile before disconnecting and removes it from connected accounts", async () => {
  const profile = {
    id: "linkedin-profile",
    platform: "linkedin",
    external_id: "member123",
    display_name: "Personal profile",
    handle: null,
    avatar_url: null,
    status: "connected",
    expires_at: null,
    last_error: null,
    is_enabled: true,
  };
  invoke.mockClear();
  list.mockResolvedValue({ data: [profile] });
  invoke.mockImplementation(async (name, { body }) => {
    if (name === "linkedin-account" && body.action === "disconnect") {
      list.mockResolvedValue({
        data: [{ ...profile, status: "disconnected", is_enabled: false }],
      });
      return { data: { ok: true } };
    }
    throw new Error("Unexpected LinkedIn request");
  });
  render(<SocialConnectionsPage />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Disconnect", exact: true }),
  );
  expect(screen.getByRole("alertdialog")).toHaveTextContent(
    "Disconnect Personal profile?",
  );
  expect(invoke).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Disconnect account" }));
  expect(await screen.findByText("No LinkedIn connected.")).toBeVisible();
  expect(
    screen.queryByText("Personal profile", { exact: true }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Connect profile" })).toBeVisible();
  expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  expect(invoke).toHaveBeenCalledExactlyOnceWith("linkedin-account", {
    body: {
      action: "disconnect",
      social_account_id: "linkedin-profile",
      workspace_id: "autotill",
    },
  });
});
vi.mock("@/contexts/WorkspaceContext", () => ({
  useWorkspace: () => ({ currentWorkspace: { id: "autotill" } }),
}));
vi.mock("@/hooks/useSuperAdmin", () => ({
  useSuperAdmin: () => ({ isSuperAdmin: false }),
}));
vi.mock("@/lib/router-compat", () => ({
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));
vi.mock("@/lib/social-insights.functions", () => ({
  getInsightsPermissions: async () => [],
}));

it.each([null, "https://media.licdn.com/expired-logo"])(
  "loads the Company Page logo when the stored avatar is %s",
  async (oldAvatar) => {
    const newAvatar = "https://media.licdn.com/current-logo";
    list.mockResolvedValue({
      data: [
        {
          id: "linkedin-company",
          platform: "linkedin",
          external_id: "organization:123",
          display_name: "AutoTill",
          avatar_url: oldAvatar,
          status: "connected",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          is_enabled: true,
        },
      ],
    });
    invoke.mockClear();
    invoke.mockResolvedValue({ data: { avatar_url: newAvatar } });

    render(<SocialConnectionsPage />);
    if (oldAvatar) {
      const image = await screen.findByAltText("");
      expect(image).toHaveAttribute("src", oldAvatar);
      expect(invoke).not.toHaveBeenCalled();
      fireEvent.error(image);
    }
    await waitFor(() =>
      expect(screen.getByAltText("")).toHaveAttribute("src", newAvatar),
    );
    expect(invoke).toHaveBeenCalledExactlyOnceWith("linkedin-account", {
      body: {
        action: "refresh_company_avatar",
        social_account_id: "linkedin-company",
        workspace_id: "autotill",
      },
    });
  },
);

it("starts Company Page authorization and connects only the chosen Page", async () => {
  const popup = { location: { href: "" }, close: vi.fn() };
  const open = vi
    .spyOn(window, "open")
    .mockReturnValue(popup as unknown as Window);
  list.mockResolvedValue({ data: [] });
  invoke.mockImplementation(async (name, { body }) => {
    if (name === "linkedin-oauth-init" && body.account_kind === "company")
      return {
        data: { authUrl: "https://www.linkedin.com/oauth/v2/authorization" },
      };
    if (name === "linkedin-account" && body.action === "list_pages")
      return {
        data: {
          pages: [
            { id: "123", name: "AutoTill" },
            { id: "456", name: "Another company" },
          ],
        },
      };
    if (name === "linkedin-account" && body.action === "select_page")
      return { data: { page: "AutoTill" } };
    throw new Error("Unexpected LinkedIn request");
  });
  try {
    render(<SocialConnectionsPage />);
    fireEvent.click(
      screen.getByRole("button", { name: "Connect Company Page" }),
    );
    await waitFor(() =>
      expect(popup.location.href).toContain("linkedin.com/oauth/"),
    );
    act(() =>
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: window.location.origin,
          data: {
            source: "autosocials-oauth",
            status: "linkedin_select",
            linkedin_select: "page-picker",
          },
        }),
      ),
    );
    const connect = await screen.findByRole("button", {
      name: "Connect selected Page",
    });
    expect(connect).toBeDisabled();
    fireEvent.click(await screen.findByRole("radio", { name: "AutoTill" }));
    fireEvent.click(connect);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("linkedin-account", {
        body: {
          action: "select_page",
          pending_id: "page-picker",
          page_id: "123",
          workspace_id: "autotill",
        },
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  } finally {
    open.mockRestore();
  }
});
