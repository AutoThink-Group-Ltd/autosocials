import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSamAttachments } from "./SamAttachments";
import type { UploadResult } from "@/workspace/uploads/uploadStore";

const { upload } = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("@/workspace/uploads/uploadStore", () => ({ startUpload: upload }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
const photo = (name: string) => new File([name], name, { type: "image/jpeg" });
const saved = (name: string, fileId: string): UploadResult => ({ files: [{ name, fileId }], errors: [] });
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(({ workspace, thread }) => useSamAttachments(workspace, thread, "create"), { wrapper, initialProps: { workspace: "workspace-a", thread: "thread-a" } });
}
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:preview") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});

describe("Sam reference attachments", () => {
  it("blocks Send until all ten photos are saved, then uses exact returned IDs", async () => {
    let finish!: (result: UploadResult) => void;
    upload.mockReturnValue(new Promise<UploadResult>((resolve) => { finish = resolve; }));
    const hook = setup();
    const files = Array.from({ length: 10 }, (_, index) => photo(`${index}.jpg`));
    act(() => hook.result.current.addFiles(files));
    expect(hook.result.current.blocked).toBe(true);
    expect(hook.result.current.ids).toEqual([]);
    await act(async () => finish({ files: files.map((file, index) => ({ name: file.name, fileId: `id-${index}` })), errors: [] }));
    expect(hook.result.current.blocked).toBe(false);
    expect(hook.result.current.ids).toHaveLength(10);
    expect(upload).toHaveBeenCalledWith("workspace-a", files);
  });

  it("keeps completed references when another photo is dropped", async () => {
    upload.mockResolvedValueOnce(saved("first.jpg", "existing-asset-id")).mockResolvedValueOnce(saved("next.jpg", "next-id"));
    const hook = setup();
    act(() => hook.result.current.addFiles([photo("first.jpg")]));
    await waitFor(() => expect(hook.result.current.ids).toEqual(["existing-asset-id"]));
    act(() => hook.result.current.addFiles([photo("next.jpg")]));
    await waitFor(() => expect(hook.result.current.ids).toEqual(["existing-asset-id", "next-id"]));
  });

  it("keeps partial failures visible and blocked until a retry succeeds", async () => {
    upload.mockResolvedValueOnce({ files: [{ name: "ok.jpg", fileId: "ok-id" }, { name: "bad.jpg", fileId: null, error: "Network failed" }], errors: ["Network failed"] });
    const hook = setup();
    act(() => hook.result.current.addFiles([photo("ok.jpg"), photo("bad.jpg")]));
    await waitFor(() => expect(hook.result.current.attachments[1]?.status).toBe("error"));
    expect(hook.result.current.blocked).toBe(true);
    expect(hook.result.current.ids).toEqual(["ok-id"]);
    upload.mockResolvedValueOnce(saved("bad.jpg", "retried-id"));
    act(() => hook.result.current.retry(hook.result.current.attachments[1]!.key));
    await waitFor(() => expect(hook.result.current.blocked).toBe(false));
    expect(hook.result.current.ids).toEqual(["ok-id", "retried-id"]);
  });

  it.each(["workspace", "thread"])("ignores an upload completing after the %s changes", async (field) => {
    let finish!: (result: UploadResult) => void;
    upload.mockReturnValue(new Promise<UploadResult>((resolve) => { finish = resolve; }));
    const hook = setup();
    act(() => hook.result.current.addFiles([photo("old.jpg")]));
    hook.rerender({ workspace: field === "workspace" ? "workspace-b" : "workspace-a", thread: field === "thread" ? "thread-b" : "thread-a" });
    await act(async () => finish(saved("old.jpg", "old-id")));
    expect(hook.result.current.attachments).toEqual([]);
    expect(hook.result.current.ids).toEqual([]);
  });

  it("removes a draft reference without deleting the saved asset", async () => {
    upload.mockResolvedValueOnce(saved("first.jpg", "saved-id"));
    const hook = setup();
    act(() => hook.result.current.addFiles([photo("first.jpg")]));
    await waitFor(() => expect(hook.result.current.ids).toEqual(["saved-id"]));
    act(() => hook.result.current.remove(hook.result.current.attachments[0]!.key));
    expect(hook.result.current.ids).toEqual([]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
    expect(upload).toHaveBeenCalledTimes(1);
  });
});
