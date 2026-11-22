import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WrittenPosts } from "./WrittenPosts";

const generate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/written-posts.functions", () => ({ generateWrittenPostsWithContext: generate }));
vi.mock("@/components/publishing/ComposerDrawer", () => ({ ComposerDrawer: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
afterEach(cleanup);

it("starts writing from Goals and then supports an independent idea", async () => {
  generate.mockResolvedValue({ posts: ["Review this draft."], sources: [], searchStatus: "off" });
  render(<WrittenPosts workspaceId="workspace" onBack={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /Generate from Goals/ }));
  await screen.findByRole("textbox", { name: "Post 1" });
  expect(generate).toHaveBeenLastCalledWith({ data: { workspace_id: "workspace", count: 7, brief: "", context_mode: "goals", current_context: false } });
  fireEvent.click(screen.getByRole("button", { name: /New Idea/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "Your idea" }), { target: { value: "Describe a future train journey" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /Use saved Goals and DNA/ }));
  fireEvent.click(screen.getByRole("button", { name: "Create posts" }));
  await waitFor(() => expect(generate).toHaveBeenLastCalledWith({ data: { workspace_id: "workspace", count: 7, brief: "Describe a future train journey", context_mode: "standalone", current_context: false } }));
});
