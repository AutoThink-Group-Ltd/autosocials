vi.mock("@/features/schedule/ScheduleDialogHost", () => ({ useScheduleDialog: () => ({ scheduleSelection: vi.fn() }) }));
vi.mock("@/lib/social-quote.functions", () => ({checkDesignQuotation: vi.fn()}));
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor, within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  plan: vi.fn(),
  save: vi.fn(),
  slide: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  renderSlide: vi.fn(),
  pdf: vi.fn(),
  generate: vi.fn(), quote: vi.fn(), check: vi.fn(), image: vi.fn(),
  moveToBin: vi.fn(), history: [] as { id: string; title: string }[],
}));
vi.mock("@/lib/brand-dna.functions", () => ({ getCreativeDnaKit: vi.fn().mockResolvedValue(null) }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <a href="/app/settings/deleted-items">{children}</a> }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({ data: queryKey[0] === "linkedin-carousels" ? mocks.history : undefined }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("./use-carousel-trash", () => ({ useCarouselTrash: () => ({ isLoading: false, isError: false, includes: () => false, moveToBin: mocks.moveToBin }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/linkedin-carousel.functions", () => ({
  planLinkedInCarousel: mocks.plan,
  saveLinkedInCarousel: mocks.save,
  saveLinkedInCarouselSlide: mocks.slide,
  getLinkedInCarousel: mocks.get,
  listLinkedInCarousels: mocks.list,
}));
vi.mock("@/lib/social-tile-image.functions", () => ({ generateSocialTileImage: mocks.generate, getSocialTileImage: mocks.image, checkSocialTileImage: mocks.check, quoteSocialTileImage: mocks.quote }));
vi.mock("./use-design-draft", () => ({ useDesignLogo: () => undefined }));
vi.mock("./DesignReferencePicker", () => ({ DesignReferencePicker: () => null }));
vi.mock("./carousel-artwork", () => ({
  renderCarouselSlide: mocks.renderSlide,
  exportCarouselPdf: mocks.pdf,
}));
import { LinkedInCarousels } from "./LinkedInCarousels";

const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const plan = {
  title: "A useful story",
  promise: "A useful takeaway",
  brand: "Acme",
  slides: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      headline: "Hook",
      supporting: "First",
      direction: "Cover",
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      headline: "Takeaway",
      supporting: "Second",
      direction: "End",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.history = [];
  mocks.moveToBin.mockResolvedValue(undefined);
  mocks.plan.mockResolvedValue(plan);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    "data:image/jpeg;base64,YWJj",
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("opens Sam’s exact slide plan for review and waits for an explicit build", async () => {
  mocks.save.mockResolvedValue({ id: "deck", plan, version: "v1", slides: [] });
  mocks.slide.mockResolvedValue({ id: "deck", plan, version: "v2", slides: [] });
  render(<LinkedInCarousels workspaceId={workspaceId} onBack={vi.fn()} initialPlan={plan} />);
  const preview = screen.getByRole("region", { name: "Carousel preview" });
  expect(preview.nextElementSibling).toContainElement(screen.getByText("Carousel settings"));
  expect(preview.nextElementSibling).toContainElement(screen.getByText("Edit slide 1"));
  expect(within(preview).getByText("Hook")).toBeVisible();
  expect(within(preview).queryByText("Takeaway")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Next slide" }));
  expect(within(preview).getByText("Takeaway")).toBeVisible();
  expect(within(preview).queryByText("Hook")).toBeNull();
  fireEvent.click(screen.getByText("Edit slide 2"));
  expect(screen.getByRole("textbox", { name: "Headline" })).toHaveValue("Takeaway");
  expect(screen.getByRole("button", { name: "Back to slide plan" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Try another idea" })).toBeNull();
  expect(mocks.plan).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.renderSlide).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Approve and build carousel" }));
  await waitFor(() => expect(mocks.renderSlide).toHaveBeenCalledTimes(2));
  expect(mocks.renderSlide.mock.calls.map((call) => call[1])).toEqual(plan.slides);
});

it("moves a saved carousel to the bin only after confirmation", async () => {
  const id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  mocks.history = [{ id, title: plan.title }];
  render(<LinkedInCarousels workspaceId={workspaceId} onBack={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: `Move carousel to bin ${plan.title}` }));
  expect(mocks.moveToBin).not.toHaveBeenCalled();
  const dialog = screen.getByRole("alertdialog");
  expect(dialog).toHaveTextContent("Settings > Deleted Items");
  fireEvent.click(within(dialog).getByRole("button", { name: "Move carousel to bin" }));
  await waitFor(() => expect(mocks.moveToBin).toHaveBeenCalledExactlyOnceWith(id));
});

it("saves ordered artwork with version and resumes only the missing slide after failure", async () => {
  let saved = {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    plan,
    version: "v1",
    slides: [] as { id: string; url: string }[],
  };
  mocks.save.mockImplementation(async ({ data }) => {
    saved = { ...saved, plan: data.plan };
    return saved;
  });
  let failed = false;
  mocks.slide.mockImplementation(async ({ data }) => {
    expect(data.image_base64).toBe("YWJj");
    expect(data.version).toBe(saved.version);
    if (data.slide_id === plan.slides[1]!.id && !failed) {
      failed = true;
      throw new Error("Temporary failure");
    }
    saved = {
      ...saved,
      version: "v2",
      slides: [
        ...saved.slides,
        { id: data.slide_id, url: "data:image/jpeg;base64,YWJj" },
      ],
    };
    return saved;
  });
  mocks.get.mockImplementation(async () => saved);
  render(<LinkedInCarousels workspaceId={workspaceId} onBack={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /Generate from Goals/ }));
  await screen.findByText("Shape the story");
  expect(mocks.plan).toHaveBeenCalledWith({ data: { workspace_id: workspaceId, brief: "", reference_ids: [], context_mode: "goals" } });
  fireEvent.click(screen.getByRole("button", { name: "Approve and build carousel" }));
  await screen.findByText("Slide 2 · Temporary failure");
  expect(screen.getByText("1 of 2 slides ready")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Retry remaining slides" }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: /Download PDF/ }),
    ).not.toBeDisabled(),
  );
  expect(mocks.slide).toHaveBeenCalledTimes(3);
  expect(mocks.slide.mock.calls[2]![0].data.slide_id).toBe(plan.slides[1]!.id);
  fireEvent.click(screen.getByRole("button", { name: "Next slide" }));
  expect(screen.getByText("2/2")).toBeTruthy();
  fireEvent.keyDown(screen.getByRole("region", { name: "Carousel preview" }), {
    key: "ArrowLeft",
  });
  expect(screen.getByText("1/2")).toBeTruthy();
  const preview = screen.getByRole("region", { name: "Carousel preview" });
  fireEvent.touchStart(preview, { touches: [{ clientX: 200 }] });
  fireEvent.touchEnd(preview, { changedTouches: [{ clientX: 100 }] });
  expect(screen.getByText("2/2")).toBeTruthy();
  fireEvent.wheel(preview, { deltaX: -50 });
  expect(screen.getByText("1/2")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Download PDF/ }));
  await waitFor(() =>
    expect(mocks.pdf).toHaveBeenCalledWith(
      ["data:image/jpeg;base64,YWJj", "data:image/jpeg;base64,YWJj"],
      "A useful story.pdf",
      "square",
    ),
  );
});


it("shows the logo source only while the product is mentioned in slide copy", () => {
  const withLogo = { ...plan, slides: [{ ...plan.slides[0]!, headline: "Try Canva", logos: [{ name: "Canva", sourceUrl: "https://www.canva.com/", image: "/carousel-products/canva.png" }] }, plan.slides[1]!] };
  render(<LinkedInCarousels workspaceId={workspaceId} onBack={vi.fn()} initialPlan={withLogo} />);
  fireEvent.click(screen.getByText("Edit slide 1"));
  fireEvent.click(screen.getAllByText("Design options")[0]!);
  expect(screen.getByRole("link", { name: "Official source" })).toHaveAttribute("href", "https://www.canva.com/");
  expect(screen.getByAltText("Canva logo")).toBeVisible();
  fireEvent.change(screen.getAllByRole("textbox", { name: "Headline" })[0]!, { target: { value: "Try a tool" } });
  expect(screen.queryByAltText("Canva logo")).toBeNull();
});


it("persists the artwork request before submitting a paid generation", async () => {
  const design = { aspect: "square" as const, treatment: "illustration" as const, composition: "top" as const, medium: "Ink", accent: "#123456", emphasis: "", typeface: "sans" as const };
  const designed = { ...plan, slides: plan.slides.map(slide => ({ ...slide, design })) };
  mocks.quote.mockResolvedValue({ credits: 4, rateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
  mocks.save.mockImplementation(async ({ data }) => ({ id: data.id, plan: data.plan, version: "v1", slides: [] }));
  mocks.generate.mockResolvedValue({ status: "pending" });
  render(<LinkedInCarousels workspaceId={workspaceId} onBack={() => {}} initialPlan={designed} />);
  fireEvent.click(screen.getByText("Edit slide 1"));
  fireEvent.click(screen.getAllByText("Design options")[0]!);
  fireEvent.click(screen.getAllByRole("button", { name: "Generate artwork" })[0]!);
  const approval = await screen.findByRole("alertdialog", { name: "Generate carousel artwork?" });
  expect(approval).toHaveTextContent("Generate 1 illustration for 4 credits total.");
  fireEvent.click(within(approval).getByRole("button", { name: "Generate artwork" }));
  await waitFor(() => expect(mocks.generate).toHaveBeenCalledOnce());
  const saved = mocks.save.mock.calls[0]![0].data.plan.slides[0].artwork.requestId;
  expect(mocks.generate.mock.calls[0]![0].data.request_id).toBe(saved);
  expect(mocks.generate.mock.calls[0]![0].data.identity).toEqual({format:"carousel",job_id:mocks.save.mock.calls[0]![0].data.id});
  expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(mocks.generate.mock.invocationCallOrder[0]!);
});

it("builds the full carousel after the user approves the illustrated plan", async () => {
  const design = { aspect: "square" as const, treatment: "illustration" as const, composition: "top" as const, medium: "Ink", accent: "#123456", emphasis: "", typeface: "sans" as const };
  const illustrated = { ...plan, slides: [
    ...Array.from({ length: 4 }, () => ({ ...plan.slides[0]!, id: crypto.randomUUID(), design })),
    plan.slides[1]!,
  ] };
  let stored = { id: "deck", plan: illustrated, version: "v1", slides: [] as { id: string; url: string }[] };
  mocks.quote.mockResolvedValue({ credits: 45, rateId: "rate" });
  mocks.save.mockImplementation(async ({ data }) => (stored = { ...stored, plan: data.plan }));
  mocks.generate.mockResolvedValue({ status: "ready", file_id: "artwork" });
  mocks.image.mockResolvedValue({ data_url: "data:image/png;base64,YWJj" });
  mocks.slide.mockImplementation(async ({ data }) => (stored = {
    ...stored, slides: [...stored.slides, { id: data.slide_id, url: "data:image/jpeg;base64,YWJj" }],
  }));
  render(<LinkedInCarousels workspaceId={workspaceId} onBack={vi.fn()} initialPlan={illustrated} />);
  expect(mocks.generate).not.toHaveBeenCalled();
  const build = screen.getByRole("button", { name: "Approve and build carousel" });
  fireEvent.click(build);
  const approval = await screen.findByRole("alertdialog", { name: "Generate carousel artwork?" });
  expect(approval).toHaveTextContent("Generate 4 illustrations for 180 credits total.");
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.generate).not.toHaveBeenCalled();
  fireEvent.click(within(approval).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(build).toBeEnabled());
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.generate).not.toHaveBeenCalled();
  expect(mocks.renderSlide).not.toHaveBeenCalled();

  fireEvent.click(build);
  const reopened = await screen.findByRole("alertdialog", { name: "Generate carousel artwork?" });
  fireEvent.click(within(reopened).getByRole("button", { name: "Generate artwork" }));
  await waitFor(() => expect(screen.getByText("Ready to Publish")).toHaveAttribute("aria-current", "step"));
  expect(mocks.quote).toHaveBeenCalledTimes(2);
  expect(mocks.generate).toHaveBeenCalledTimes(4);
  expect(mocks.generate).toHaveBeenCalledWith({ data: expect.objectContaining({ expected_credits: 45, expected_rate_id: "rate" }) });
  expect(mocks.renderSlide).toHaveBeenCalledTimes(5);
  expect(mocks.slide.mock.invocationCallOrder[0]).toBeLessThan(mocks.generate.mock.invocationCallOrder[1]!);
});


it("allows a confirmed unsubmitted request to retry with the same ID after a fresh quote", async () => {
  const requestId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const design = { aspect: "square" as const, treatment: "illustration" as const, composition: "top" as const, medium: "Ink", accent: "#123456", emphasis: "", typeface: "sans" as const };
  const designed = { ...plan, slides: plan.slides.map((slide, i) => ({ ...slide, design, ...(i === 0 ? { artwork: { requestId } } : {}) })) };
  mocks.save.mockImplementation(async ({ data }) => ({ id: data.id, plan: data.plan, version: "v1", slides: [] }));
  mocks.get.mockResolvedValue({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", plan: designed, version: "v1", slides: [] });
  mocks.check.mockResolvedValue({ status: "not_found" });
  mocks.quote.mockResolvedValue({ credits: 4, rateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
  mocks.generate.mockResolvedValue({ status: "pending" });
  render(<LinkedInCarousels workspaceId={workspaceId} onBack={() => {}} deckId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" />);
  fireEvent.click(await screen.findByRole("button", { name: "Edit outline" }));
  fireEvent.click(screen.getByText("Edit slide 1"));
  fireEvent.click(screen.getByText("Design options"));
  fireEvent.click(await screen.findByRole("button", { name: "Check artwork status" }));
  fireEvent.click(await screen.findByRole("button", { name: "Retry artwork request" }));
  const approval = await screen.findByRole("alertdialog", { name: "Generate carousel artwork?" });
  fireEvent.click(within(approval).getByRole("button", { name: "Generate artwork" }));
  await waitFor(() => expect(mocks.generate).toHaveBeenCalledOnce());
  expect(mocks.generate.mock.calls[0]![0].data.request_id).toBe(requestId);
  expect(mocks.quote).toHaveBeenCalledOnce();
});

it("reopens an unfinished carousel and waits for its saved artwork without spending again", async () => {
  const id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const requestId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const design = { aspect: "square" as const, treatment: "illustration" as const, composition: "top" as const, medium: "Ink", accent: "#123456", emphasis: "", typeface: "sans" as const };
  let stored = {
    id, version: "v1", plan: { ...plan, slides: [plan.slides[0]!, { ...plan.slides[1]!, design, artwork: { requestId } }] },
    slides: [{ id: plan.slides[0]!.id, url: "data:image/jpeg;base64,YWJj" }],
  };
  mocks.get.mockImplementation(async () => stored);
  mocks.save.mockImplementation(async ({ data }) => (stored = { ...stored, plan: data.plan }));
  mocks.slide.mockImplementation(async ({ data }) => (stored = { ...stored, slides: [...stored.slides, { id: data.slide_id, url: "data:image/jpeg;base64,YWJj" }] }));
  const originalTimeout = window.setTimeout.bind(window);
  vi.spyOn(window, "setTimeout").mockImplementation((handler, delay, ...args) =>
    originalTimeout(handler, delay === 6000 ? 50 : delay, ...args),
  );
  mocks.check.mockResolvedValueOnce({ status: "pending" })
    .mockResolvedValueOnce({ status: "ready", file_id: "finished-artwork", data_url: "data:image/png;base64,YWJj" });
  render(<LinkedInCarousels workspaceId={workspaceId} onBack={vi.fn()} deckId={id} />);
  expect(await screen.findByText("1 of 2 slides ready")).toBeVisible();
  expect(screen.getByText("2/2")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Resume carousel build" }));
  expect(await screen.findByText("Slide 2 of 2 · Waiting for the illustration")).toBeVisible();
  await waitFor(() => expect(screen.getByRole("button", { name: "Download PDF" })).toBeEnabled());
  expect(mocks.check).toHaveBeenCalledTimes(2);
  expect(mocks.check).toHaveBeenLastCalledWith({ data: { workspace_id: workspaceId, request_id: requestId } });
  expect(mocks.quote).not.toHaveBeenCalled();
  expect(mocks.generate).not.toHaveBeenCalled();
  expect(mocks.slide).toHaveBeenCalledExactlyOnceWith({ data: expect.objectContaining({ slide_id: plan.slides[1]!.id }) });
});

it("rebuilds only the selected finished slide using its saved illustration", async () => {
  const id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const fileId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const design = { aspect: "portrait" as const, treatment: "illustration" as const, composition: "right" as const, medium: "Pencil sketch", accent: "#123456", emphasis: "", typeface: "sans" as const };
  const third = { ...plan.slides[1]!, id: "33333333-3333-4333-8333-333333333333", headline: "Give the answer something solid to stand on.", design, artwork: { requestId: id, fileId } };
  const saved = { id, version: "v1", plan: { ...plan, slides: [...plan.slides, third] }, slides: [...plan.slides, third].map((slide) => ({ id: slide.id, url: "data:image/jpeg;base64,YWJj" })) };
  mocks.get.mockResolvedValue(saved);
  mocks.image.mockResolvedValue({ data_url: "data:image/png;base64,YWJj" });
  mocks.slide.mockResolvedValue({ ...saved, version: "v2" });
  render(<LinkedInCarousels workspaceId={workspaceId} onBack={vi.fn()} deckId={id} />);
  fireEvent.click(await screen.findByRole("button", { name: "Show slide 3, saved" }));
  fireEvent.click(screen.getByRole("button", { name: "Rebuild this slide" }));
  await waitFor(() => expect(mocks.slide).toHaveBeenCalledExactlyOnceWith({ data: expect.objectContaining({ slide_id: third.id, version: "v1" }) }));
  expect(mocks.image).toHaveBeenCalledExactlyOnceWith({ data: { workspace_id: workspaceId, file_id: fileId } });
  expect(mocks.renderSlide).toHaveBeenCalledOnce();
  expect(mocks.quote).not.toHaveBeenCalled();
  expect(mocks.generate).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
  expect(screen.getByText("3/3")).toBeVisible();
});
