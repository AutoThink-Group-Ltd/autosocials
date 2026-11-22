import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  search: vi.fn(),
  save: vi.fn(),
  list: vi.fn(),
  recent: vi.fn(),
  operation: vi.fn(),
  resources: vi.fn(),
  workspace: { id: "11111111-1111-4111-8111-111111111111" },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "test-user" } }) }));
vi.mock("@/contexts/WorkspaceContext", () => ({
  useWorkspace: () => ({ currentWorkspace: mocks.workspace, loading: false }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    onClick,
  }: {
    children: React.ReactNode;
    to: string;
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  }) => (
    <a
      href={to}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
    >
      {children}
    </a>
  ),
}));
vi.mock("@/lib/virlo.functions", () => ({
  getVirloStatus: mocks.status,
  searchVirloResearch: mocks.search,
  saveVirloResearch: mocks.save,
  listSavedVirloResearch: mocks.list,
  listRecentVirloSearches: mocks.recent,
  runVirloOperation: mocks.operation,
  listVirloResources: mocks.resources,
}));
import { ResultCards, VirloResearchPage } from "./VirloResearchPage";

function setup() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <VirloResearchPage />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("crypto", webcrypto);
  sessionStorage.clear();
  mocks.status.mockResolvedValue({ configured: true });
  mocks.list.mockResolvedValue([]);
  mocks.recent.mockResolvedValue([]);
  mocks.resources.mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Research", () => {
  it("shows slideshow covers alongside video search results", () => {
    render(<ResultCards workspaceId={mocks.workspace.id} result={{ id: "mixed", title: "Mixed", kind: "videos", page: 1, data: { videos: [], slideshows: { items: [{ url: "https://www.tiktok.com/@creator/photo/123", title: "Photo story", images: [{ image_url: "https://auth.virlo.ai/storage/v1/object/public/slideshow-images/example.jpg" }] }] } } }} />);
    expect(screen.getByText("Photo story")).toBeInTheDocument();
    expect(screen.getByAltText("TikTok post preview")).toBeInTheDocument();
  });
  it("shows creator identities and Virlo profile photos", () => {
    render(<ResultCards workspaceId={mocks.workspace.id} result={{ id: "creator", title: "Creators", kind: "creators", page: 1, data: { creators: [{ display_name: "Skincare Creator", username: "creator", bio: "Skincare tips", profile_url: "https://www.instagram.com/creator/", avatar_url: "https://auth.virlo.ai/storage/v1/object/public/avatars/example.jpg" }] } }} />);
    expect(screen.getByText("Skincare Creator")).toBeInTheDocument();
    expect(screen.getByText("Skincare tips")).toBeInTheDocument();
    expect(screen.queryByText(/Preview unavailable/)).not.toBeInTheDocument();
  });
  it("shows videos nested inside completed lookup results", () => {
    render(<ResultCards workspaceId={mocks.workspace.id} result={{ id: "lookup", title: "Lookup", kind: "lookup_status", page: 1, data: { result: { videos: [{ title: "Found post", url: "https://www.tiktok.com/@creator/video/123" }] } } }} />);
    expect(screen.getByText("Found post")).toBeInTheDocument();
    expect(screen.getByTitle("Social post preview: Found post")).toBeInTheDocument();
  });
  it("shows a safe Virlo Instagram cover with a link to the original post", () => {
    render(<ResultCards workspaceId={mocks.workspace.id} result={{ id: "ig", title: "Instagram", kind: "videos", page: 1, data: { videos: [{ url: "https://www.instagram.com/reel/example/", description: "A reel", thumbnail_url: "https://auth.virlo.ai/storage/v1/object/public/covers/example.jpg" }] } }} />);
    expect(screen.getByAltText("Instagram post preview")).toHaveAttribute("src", "https://auth.virlo.ai/storage/v1/object/public/covers/example.jpg");
    expect(screen.getByRole("link", { name: /Open Instagram post: A reel/ })).toHaveAttribute("href", "https://www.instagram.com/reel/example/");
  });
  it("shows captions, dates and nested metrics from live creator posts", () => {
    render(<ResultCards workspaceId={mocks.workspace.id} result={{ id: "result", title: "Creator", kind: "raw_creator_videos", page: 1, data: [{ url: "https://www.tiktok.com/@creator/video/123", caption: "A skincare routine", published_at: "2026-11-10T12:00:00Z", stats: { views: 1200, likes: 240 }, author: { handle: "creator" } }] }} />);
    expect(screen.getByText("A skincare routine")).toBeInTheDocument();
    expect(screen.getByText("2026-11-10")).toBeInTheDocument();
    expect(screen.getByText("1.2k")).toBeInTheDocument();
    expect(screen.getByText("240")).toBeInTheDocument();
    expect(screen.getByTitle("Social post preview: A skincare routine")).toBeInTheDocument();
  });
  it("renders playable social post previews", async () => {
    mocks.search.mockResolvedValue({ id: "result-id", data: { videos: [{ id: "post", title: "Creator post", url: "https://www.tiktok.com/@creator/video/123", platform: "tiktok", views: 5000 }] } });
    setup();
    await waitFor(() => expect(screen.getByRole("button", { name: "Search" })).toBeEnabled());
    fireEvent.change(screen.getByRole("searchbox", { name: "Topic" }), { target: { value: "skincare" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByTitle("Social post preview: Creator post")).toHaveAttribute("src", "https://www.tiktok.com/embed/v2/123");
  });
  it("reopens a recent search without calling Virlo again", async () => {
    mocks.recent.mockResolvedValue([{ id: "past", title: "AI Claude", kind: "videos", created_at: "2026-11-14T12:00:00Z", data: { videos: [] } }]);
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /AI Claude/ }));
    expect(screen.getByRole("searchbox", { name: "Topic" })).toHaveValue("AI Claude");
    expect(screen.getByText(/No results were returned/)).toBeInTheDocument();
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it("keeps the discover draft when switching views and returning to Research", async () => {
    const page = setup();
    fireEvent.change(await screen.findByLabelText("Topic"), { target: { value: "skincare routines" } });
    fireEvent.click(screen.getByLabelText("Creators"));
    fireEvent.change(screen.getByLabelText("Platform"), { target: { value: "instagram" } });
    fireEvent.click(screen.getByRole("button", { name: "Saved research" }));
    fireEvent.click(screen.getByRole("button", { name: "Discover" }));
    expect(screen.getByLabelText("Topic")).toHaveValue("skincare routines");
    page.unmount();
    setup();
    expect(await screen.findByLabelText("Topic")).toHaveValue("skincare routines");
    expect(screen.getByLabelText("Creators")).toBeChecked();
    expect(screen.getByLabelText("Platform")).toHaveValue("instagram");
  });
  it("keeps search disabled if the optional provider is not configured", async () => {
    mocks.status.mockResolvedValue({ configured: false });
    setup();
    expect(
      await screen.findByText(/Research is not connected yet/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it("searches within the selected workspace and saves a server result reference", async () => {
    mocks.search.mockResolvedValue({
      id: "result-id",
      data: {
        videos: [
          {
            id: "one",
            platform: "tiktok",
            description: "A public video",
            url: "https://www.tiktok.com/@creator/video/1",
            views: 1000,
          },
        ],
      },
    });
    mocks.save.mockResolvedValue({ ok: true });
    setup();
    await screen.findByRole("button", { name: "Search" });
    fireEvent.change(screen.getByRole("searchbox", { name: "Topic" }), {
      target: { value: "skincare" },
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Search" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("A public video")).toBeInTheDocument();
    expect(screen.getByTitle("Social post preview: A public video")).toHaveAttribute("src", "https://www.tiktok.com/embed/v2/1");
    expect(mocks.search).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspace_id: mocks.workspace.id,
        kind: "videos",
        query: "skincare",
        page: 1,
      }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Save search" }));
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith({
        data: {
          workspace_id: mocks.workspace.id,
          result_id: "result-id",
          title: "skincare",
        },
      }),
    );
  });
  it("never links a provider supplied URL outside approved social domains", async () => {
    mocks.search.mockResolvedValue({
      id: "result-id",
      data: {
        videos: [
          {
            id: "one",
            description: "Unsafe source",
            url: "https://tiktok.com.evil.example/steal",
          },
        ],
      },
    });
    setup();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Search" })).toBeEnabled(),
    );
    fireEvent.change(screen.getByRole("searchbox", { name: "Topic" }), {
      target: { value: "skincare" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("Unsafe source")).toBeInTheDocument();
    expect(screen.queryByTitle(/Social post preview/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Open source/ }),
    ).not.toBeInTheDocument();
  });

  it("reuses the search request identity after an uncertain failure", async () => {
    mocks.search.mockRejectedValue(new Error("Outcome unknown"));
    setup();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Search" })).toBeEnabled(),
    );
    fireEvent.change(screen.getByRole("searchbox", { name: "Topic" }), {
      target: { value: "skincare" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(mocks.search).toHaveBeenCalledTimes(2));
    expect(mocks.search.mock.calls[0]?.[0].data.request_id).toBe(
      mocks.search.mock.calls[1]?.[0].data.request_id,
    );
  });

  it("retains a hashed request identity across a page remount without storing the query in its key", async () => {
    mocks.search.mockRejectedValue(new Error("Outcome unknown"));
    const first = setup();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Search" })).toBeEnabled(),
    );
    fireEvent.change(screen.getByRole("searchbox", { name: "Topic" }), {
      target: { value: "private topic" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByRole("alert");
    const firstId = mocks.search.mock.calls[0]?.[0].data.request_id;
    expect(Object.keys(sessionStorage).filter((key) => key.startsWith("as:virlo-pending:")).join()).not.toContain("private topic");
    first.unmount();
    setup();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Search" })).toBeEnabled(),
    );
    fireEvent.change(screen.getByRole("searchbox", { name: "Topic" }), {
      target: { value: "private topic" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(mocks.search).toHaveBeenCalledTimes(2));
    expect(mocks.search.mock.calls[1]?.[0].data.request_id).toBe(firstId);
  });

  it("requires explicit consent before starting recurring tracking", async () => {
    const confirm = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    mocks.operation.mockResolvedValue({
      id: "result-id",
      data: { status: "queued" },
    });
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Explore & track" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Topic trends" }),
      ).toBeEnabled(),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Research tool" }), {
      target: { value: "track_creator" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Creator handle" }), {
      target: { value: "creator" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Track a creator" }));
    expect(mocks.operation).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("$0.25 per check"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Track a creator" }));
    await waitFor(() =>
      expect(mocks.operation).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspace_id: mocks.workspace.id,
          confirmed: true,
          operation: expect.objectContaining({
            operation: "track_creator",
            cadence: "weekly",
          }),
        }),
      }),
    );
    confirm.mockRestore();
  });

  it("opens source evidence as a reviewable draft without starting creation", async () => {
    mocks.search.mockResolvedValue({
      id: "result-id",
      data: {
        videos: [
          {
            id: "one",
            description: "A public example",
            url: "https://www.tiktok.com/@creator/video/1",
          },
        ],
      },
    });
    setup();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Search" })).toBeEnabled(),
    );
    fireEvent.change(screen.getByRole("searchbox", { name: "Topic" }), {
      target: { value: "skincare" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Use in Create" }),
    );
    const link = screen.getByRole("link", { name: "Open in Create" });
    expect(link).toHaveAttribute("href", "/app/create");
    fireEvent.click(link, { button: 1 });
    const handoff = JSON.parse(
      sessionStorage.getItem(`as:virlo-create:${mocks.workspace.id}`) ?? "null",
    );
    expect(handoff.draft).toContain("A public example");
    expect(handoff.draft).toContain("https://www.tiktok.com/@creator/video/1");
    expect(mocks.operation).not.toHaveBeenCalled();
  });
});
