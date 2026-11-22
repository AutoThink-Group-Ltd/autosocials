import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PipelineTrashAction } from "./PipelineTrash";

it("requires confirmation and explains that jobs and publishing continue", async () => {
  const change = vi.fn().mockResolvedValue(undefined);
  render(
    <PipelineTrashAction title="A plan" trashed={false} onChange={change} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Delete plan A plan" }));
  const dialog = screen.getByRole("alertdialog");
  expect(
    within(dialog).getByText(
      /Work already in progress and scheduled publishing will continue/,
    ),
  ).toBeInTheDocument();
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete plan" }));
  await waitFor(() => expect(change).toHaveBeenCalledWith(true));
});
it("names the ready carousel and only deletes it after confirmation", async () => {
  const change = vi.fn().mockResolvedValue(undefined);
  render(
    <PipelineTrashAction
      readyAsset
      title="Turn one client question into a useful post"
      trashed={false}
      onChange={change}
    />,
  );
  const trigger = screen.getByRole("button", {
    name: /Delete asset Turn one client question/,
  });
  fireEvent.click(trigger);
  const dialog = screen.getByRole("alertdialog", {
    name: "Delete asset?",
  });
  expect(dialog).toHaveTextContent(
    "Turn one client question into a useful post",
  );
  expect(dialog).toHaveTextContent("Settings > Deleted Items");
  fireEvent.click(within(dialog).getByText("Cancel"));
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(trigger);
  fireEvent.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Delete asset",
    }),
  );
  await waitFor(() => expect(change).toHaveBeenCalledExactlyOnceWith(true));
});

it("bounds a long asset excerpt and keeps the dialog usable on a narrow screen", () => {
  const title = "A very long written post ".repeat(40);
  render(
    <PipelineTrashAction
      readyAsset
      title={title}
      trashed={false}
      onChange={vi.fn()}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: /Delete asset A very long written post/,
    }),
  );
  const dialog = screen.getByRole("alertdialog", { name: "Delete asset?" });
  expect(dialog).toHaveClass(
    "max-h-[calc(100dvh-2rem)]",
    "w-[calc(100%-2rem)]",
    "overflow-y-auto",
  );
  const excerpt = within(dialog).getByText(/A very long written post/);
  expect(excerpt.textContent!.length).toBeLessThanOrEqual(181);
  expect(excerpt).toHaveClass("break-words", "overflow-y-auto");
  expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeEnabled();
  expect(
    within(dialog).getByRole("button", { name: "Delete asset" }),
  ).toBeEnabled();
});

it("keeps long plan text out of the confirmation heading", () => {
  const title = "A".repeat(300);
  render(
    <PipelineTrashAction title={title} trashed={false} onChange={vi.fn()} />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Delete plan A+/ }));
  expect(
    screen.getByRole("heading", { name: "Delete plan?" }),
  ).toBeInTheDocument();
});
