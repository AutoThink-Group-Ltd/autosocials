import { CampaignCard } from "./CampaignCard";
import { StopSamButton } from "./StopSamButton";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { SAM_TOOLS, dedupeById } from "@/lib/sam.tools";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import samPortrait from "@/assets/sam-portrait.jpg";
import { MODULES, currentModule } from "@/brand/tokens";
import { AppIcon } from "@/components/brand/AppIcon";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { getBrandContext } from "@/lib/brand-assets.functions";
import { SAM_CREATE_NEEDED, SAM_CREATE_STARTERS, SAM_GREETINGS, SAM_STARTERS } from "@/lib/sam.prompt";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useWorkspaceUi } from "@/workspace/WorkspaceUi";
import { LifeBuoy, Mic, MicOff, MessageSquarePlus, History, Search, Copy } from "lucide-react";
import { requestAiSupport } from "@/lib/openai-support.functions";
import { IDEATION_PROGRESS_PREFIX, ideationIsActive } from "@/lib/ideation-status";
import { SamAttachButton, SamAttachmentGrid, useSamAttachments } from "./SamAttachments";

type Msg = { id: string; role: string; content: string; canvas_id: string | null; created_at: string };
type ChatThread = { id: string; title: string; created_at: string; updated_at: string };
type SpeechResult = { isFinal: boolean; [index: number]: { transcript: string } };
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };
type SpeechRecognizer = { continuous: boolean; interimResults: boolean; lang: string; onresult: ((event: SpeechEvent) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null; start: () => void; stop: () => void };

export function SamPane({ onOpenNav }: { onOpenNav: () => void }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const module = currentModule(pathname);
  const mod = MODULES.find((m) => m.id === module)!;
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id;
  const { activeCanvas, setActiveCanvas, setMobileView } = useWorkspaceUi();
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [localIdeating, setLocalIdeating] = useState(false);
  const [quotaSupport, setQuotaSupport] = useState(false);
  const [supportSent, setSupportSent] = useState(false);
  const [supportSending, setSupportSending] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const photos = useSamAttachments(wsId, selectedThreadId, module);
  const sentAttachmentIds = useRef<string[]>([]);
  const sendSucceeded = useRef(false);
  const [draggingPhotos, setDraggingPhotos] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [creatingThread, setCreatingThread] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognizer | null>(null);
  const speechBaseRef = useRef("");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    composer.style.height = "auto";
    composer.style.height = `${Math.min(composer.scrollHeight, 240)}px`;
  }, [input]);

  function stopDictation() {
    const recognizer = recognitionRef.current;
    if (!recognizer) return;
    recognizer.onresult = null;
    recognizer.stop();
    recognitionRef.current = null;
    setListening(false);
  }

  useEffect(() => {
    setSelectedThreadId(null);
    setHistoryOpen(false);
    setMessages([]);
    setLocalIdeating(false);
    stopDictation();
  // A workspace or stage switch must never carry another conversation into this one.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId, module]);

  useEffect(() => {
    if (!wsId || module !== "create") return;
    const key = `as:virlo-create:${wsId}`;
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      const value: unknown = JSON.parse(raw);
      if (!value || typeof value !== "object" || !("draft" in value) || typeof value.draft !== "string") return;
      const draft = value.draft.trim().slice(0, 2000);
      if (!draft) return;
      sessionStorage.removeItem(key);
      setInput((previous) => previous.trim() ? `${previous}\n\n${draft}` : draft);
      setMobileView("sam");
    } catch { /* Keep any existing composer draft if storage is unavailable. */ }
  }, [wsId, module, setMobileView]);

  const { data: threads = [] } = useQuery({
    queryKey: ["sam-threads", wsId, module], enabled: !!wsId,
    queryFn: async (): Promise<ChatThread[]> => {
      const { data, error } = await supabase.from("agent_threads").select("id,title,created_at,updated_at")
        .eq("workspace_id", wsId!).eq("module", module).order("updated_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!selectedThreadId && threads.length) setSelectedThreadId(threads[0]!.id);
  }, [threads, selectedThreadId]);

  const filteredThreads = threads.filter((thread) => thread.title.toLowerCase().includes(historySearch.trim().toLowerCase()));

  useEffect(() => {
    const onIdeation = (event: Event) => {
      const detail = (event as CustomEvent<{ workspaceId: string; active: boolean }>).detail;
      if (module !== "create" || detail?.workspaceId !== wsId) return;
      setLocalIdeating(detail.active);
      void qc.invalidateQueries({ queryKey: ["sam-messages", wsId, module] });
      void qc.invalidateQueries({ queryKey: ["sam-threads", wsId, module] });
    };
    window.addEventListener("as:sam-ideation", onIdeation);
    return () => window.removeEventListener("as:sam-ideation", onIdeation);
  }, [module, wsId, qc]);

  const { data: messages = [] } = useQuery({
    queryKey: ["sam-messages", wsId, module, selectedThreadId],
    enabled: !!wsId && !!selectedThreadId,
    queryFn: async (): Promise<Msg[]> => {
      const { data } = await supabase.from("agent_messages").select("id,role,content,canvas_id,created_at")
        .eq("thread_id", selectedThreadId!).eq("workspace_id", wsId!).order("created_at", { ascending: false }).limit(200);
      return dedupeById((data ?? []).reverse());
    },
    refetchInterval: (query) => localIdeating || (query.state.data as Msg[] | undefined)?.some((message) => ideationIsActive(message)) ? 1500 : false,
  });
  const canvasIds = messages.flatMap(message => message.canvas_id ? [message.canvas_id] : []);
  const campaignCanvases = useQuery({
    queryKey: ["sam-campaign-canvases", wsId, canvasIds],
    enabled: !!wsId && canvasIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("canvases").select("id,blocks").eq("workspace_id", wsId!).in("id", canvasIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  const ideating = localIdeating || (module === "create" && messages.some((message) => ideationIsActive(message)));

  const { data: brandCtx } = useQuery({
    queryKey: ["brand-context", wsId], enabled: !!wsId && module === "create",
    queryFn: () => getBrandContext({ data: { workspace_id: wsId! } }),
  });
  const needsBrand = module === "create" && !!brandCtx && !brandCtx.ready;

  // Live, streaming turn. Saved history comes from the database; live messages are cleared once it reloads.
  const ctxRef = useRef({ wsId, module, canvasId: activeCanvas?.id ?? null, threadId: selectedThreadId });
  ctxRef.current = { wsId, module, canvasId: activeCanvas?.id ?? null, threadId: selectedThreadId };
  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/sam/chat",
    prepareSendMessagesRequest: async ({ messages: ms }) => {
      const last = ms[ms.length - 1];
      const text = last?.parts.map((p) => (p.type === "text" ? p.text : "")).join("") ?? "";
      const { data: s } = await supabase.auth.getSession();
      return {
        headers: { Authorization: `Bearer ${s.session?.access_token ?? ""}` },
        body: { workspace_id: ctxRef.current.wsId, module: ctxRef.current.module, message: text, canvas_id: ctxRef.current.canvasId, thread_id: ctxRef.current.threadId, request_key: last?.id, attachment_ids: sentAttachmentIds.current },
      };
    },
  }), []);
  const { messages: live, sendMessage, status, stop, setMessages } = useChat({
    transport,
    onError: (e) => {
      if (/ai_quota_exhausted|run out of credits|insufficient_quota/i.test(e.message)) {
        setQuotaSupport(true);
        setSupportSent(false);
        return;
      }
      toast.error(e.message || "Sam couldn't respond. Please try again.");
    },
    onFinish: async ({ isError, isAbort, isDisconnect }) => {
      sendSucceeded.current = !isError && !isAbort && !isDisconnect;
      await qc.invalidateQueries({ queryKey: ["sam-messages", wsId, module] });
      await qc.invalidateQueries({ queryKey: ["sam-threads", wsId, module] });
      await qc.invalidateQueries({ queryKey: ["canvases", wsId, module] });
      if (module === "create") await qc.invalidateQueries({ queryKey: ["pipeline-plans", wsId] });
      await qc.invalidateQueries({ queryKey: ["narrative-library", wsId] });
      await qc.invalidateQueries({ queryKey: ["batches", wsId] });
      setMessages([]);
    },
  });
  const busy = status === "submitted" || status === "streaming";
  const pending = busy || ideating ? "1" : null;

  // Open any canvas Sam just made.
  const openedRef = useRef(new Set<string>());
  useEffect(() => {
    for (const m of live) for (const p of m.parts) {
      const out = (p as { state?: string; output?: { canvas_id?: string; version?: number; title?: string } }).output;
      if ((p as { state?: string }).state === "output-available" && out?.canvas_id && !openedRef.current.has(out.canvas_id)) {
        openedRef.current.add(out.canvas_id);
        setActiveCanvas({ id: out.canvas_id, version: out.version ?? 1, title: out.title ?? "Canvas" });
        if (module === "create") {
          void qc.invalidateQueries({ queryKey: ["pipeline-plans", wsId] });
          void navigate({ to: "/app/create", search: { stage: "plans", item: `canvas:${out.canvas_id}` } });
          setMobileView("live");
        }
        void qc.invalidateQueries({ queryKey: ["canvases", wsId, module] });
      }
    }
  }, [live, setActiveCanvas, setMobileView, navigate, pathname, qc, wsId, module]);

  // Follow new text only when the reader is already near the bottom.
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [messages, live]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || !wsId || busy || creatingThread || photos.blocked) return;
    const attachmentIds = [...photos.ids];
    const sendingWorkspace = wsId;
    const sendingModule = module;
    let threadId = selectedThreadId;
    if (!threadId) {
      setCreatingThread(true);
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) throw new Error("Please sign in again.");
        const { data, error } = await supabase.from("agent_threads").insert({ workspace_id: wsId, module, created_by: userData.user.id, title: "New chat" }).select("id").single();
        if (error) throw error;
        threadId = data.id;
        setSelectedThreadId(threadId);
        void qc.invalidateQueries({ queryKey: ["sam-threads", wsId, module] });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't start a chat.");
        return;
      } finally { setCreatingThread(false); }
    }
    ctxRef.current.threadId = threadId;
    sentAttachmentIds.current = attachmentIds;
    sendSucceeded.current = false;
    stopDictation();
    setInput("");
    setQuotaSupport(false);
    pinned.current = true;
    await sendMessage({ text: msg });
    if (sendSucceeded.current && ctxRef.current.wsId === sendingWorkspace && ctxRef.current.module === sendingModule && ctxRef.current.threadId === threadId) photos.clear();
  }

  async function newChat() {
    if (!wsId || busy || creatingThread) return;
    stopDictation();
    setCreatingThread(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Please sign in again.");
      const { data, error } = await supabase.from("agent_threads").insert({ workspace_id: wsId, module, created_by: userData.user.id, title: "New chat" }).select("id").single();
      if (error) throw error;
      setInput("");
      setMessages([]);
      setSelectedThreadId(data.id);
      setHistoryOpen(false);
      await qc.invalidateQueries({ queryKey: ["sam-threads", wsId, module] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't start a new chat.");
    } finally { setCreatingThread(false); }
  }

  function toggleMicrophone() {
    if (recognitionRef.current) { stopDictation(); return; }
    const browser = window as Window & { SpeechRecognition?: new () => SpeechRecognizer; webkitSpeechRecognition?: new () => SpeechRecognizer };
    const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Recognition) { toast.error("Voice dictation isn't available in this browser. Try Chrome or Edge."); return; }
    const recognizer = new Recognition();
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.lang = navigator.language || "en-GB";
    speechBaseRef.current = input.trim();
    recognizer.onresult = (event) => {
      let transcript = "";
      for (let index = 0; index < event.results.length; index++) transcript += `${event.results[index]?.[0]?.transcript ?? ""} `;
      setInput([speechBaseRef.current, transcript.trim()].filter(Boolean).join(" "));
    };
    recognizer.onerror = (event) => {
      if (event.error !== "aborted" && event.error !== "no-speech") toast.error(event.error === "not-allowed" ? "Allow microphone access to dictate to Sam." : "Voice dictation stopped. Please try again.");
      recognitionRef.current = null;
      setListening(false);
    };
    recognizer.onend = () => { recognitionRef.current = null; setListening(false); };
    try { recognizer.start(); recognitionRef.current = recognizer; setListening(true); }
    catch { toast.error("Couldn't start voice dictation. Check microphone access."); }
  }

  async function requestSupport() {
    if (supportSending || supportSent) return;
    setSupportSending(true);
    try {
      await requestAiSupport({ data: {} });
      setSupportSent(true);
    } catch {
      toast.error("Couldn't send the support request. Please email info@autosocials.com.");
    } finally {
      setSupportSending(false);
    }
  }

  const compact = messages.length > 0 || live.length > 0;
  return (
    <div className="relative flex h-full w-full flex-col bg-canvas"
      onDragOver={(event) => { if (module === "create" && event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = busy ? "none" : "copy"; setDraggingPhotos(!busy); } }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingPhotos(false); }}
      onDrop={(event) => { if (module !== "create" || !event.dataTransfer.files.length) return; event.preventDefault(); setDraggingPhotos(false); if (!busy) photos.addFiles(Array.from(event.dataTransfer.files)); }}>
      {draggingPhotos && <div className="pointer-events-none absolute inset-2 z-50 flex items-center justify-center rounded-[16px] border-2 border-dashed border-ink bg-canvas/95 p-6 text-center font-medium">Drop photos to save them in Brand Assets and attach them to Sam</div>}
      <div className="shrink-0 border-b border-border">
        <button type="button" onClick={onOpenNav} className="px-4 pt-2 text-[13px] font-medium xl:hidden" aria-label="Open navigation">Menu</button>
        <div className="flex items-center justify-between gap-2 px-4 pt-3">
          <button type="button" onClick={() => void newChat()} disabled={!wsId || busy || creatingThread}
            className="inline-flex items-center gap-2 rounded-[10px] border border-border-control bg-surface px-3 py-2 text-[13px] font-medium hover:bg-surface-subtle disabled:opacity-50">
            <MessageSquarePlus size={16} /> New chat
          </button>
          <button type="button" onClick={() => setHistoryOpen((open) => !open)} aria-expanded={historyOpen} aria-controls="sam-chat-history"
            className="inline-flex items-center gap-2 rounded-[10px] border border-border-control bg-surface px-3 py-2 text-[13px] font-medium hover:bg-surface-subtle">
            <History size={16} /> History
          </button>
        </div>
        {historyOpen && <div id="sam-chat-history" className="mx-4 mt-3 rounded-[12px] border border-border bg-surface p-2">
          <label className="flex items-center gap-2 rounded-[9px] border border-border-control bg-canvas px-2">
            <Search size={15} className="text-muted-foreground" />
            <input value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Find a chat" aria-label="Find a chat"
              className="min-w-0 flex-1 bg-transparent py-2 text-[13px] outline-none" />
          </label>
          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
            {filteredThreads.length ? filteredThreads.map((thread) => <button key={thread.id} type="button" disabled={busy}
              onClick={() => { stopDictation(); setInput(""); setMessages([]); setSelectedThreadId(thread.id); setHistoryOpen(false); pinned.current = true; }}
              aria-current={selectedThreadId === thread.id ? "true" : undefined}
              className={cn("flex w-full items-center justify-between gap-2 rounded-[8px] px-2 py-2 text-left text-[13px] hover:bg-surface-subtle disabled:opacity-50", selectedThreadId === thread.id && "bg-surface-subtle font-semibold")}>
              <span className="min-w-0 truncate">{thread.title}</span>
              <span className="shrink-0 text-[11px] font-normal text-muted-foreground">{new Date(thread.updated_at).toLocaleDateString("en-GB", { timeZone: "UTC" })}</span>
            </button>) : <p className="px-2 py-3 text-[12px] text-muted-foreground">No chats found.</p>}
          </div>
        </div>}
        <div className={cn("flex flex-col items-center text-center transition-all duration-500", compact ? "gap-2 py-4" : "gap-3 py-8")}>
          <div className={cn("relative flex items-center justify-center transition-all duration-500", compact ? "h-28 w-28" : "h-40 w-40")}>
            <span aria-hidden className={cn("sam-pulse-ring absolute inset-2 rounded-full", pending && "sam-pulse-fast")} />
            <span aria-hidden className={cn("sam-pulse-ring sam-pulse-delay absolute inset-2 rounded-full", pending && "sam-pulse-fast")} />
            <img src={samPortrait} alt="Sam" width={144} height={144}
              className={cn("sam-breathe relative rounded-full border-4 border-canvas object-cover shadow-lg transition-all duration-500", compact ? "h-24 w-24" : "h-36 w-36")} />
            <span aria-label="Online" className={cn("absolute h-4 w-4 rounded-full border-2 border-canvas bg-[hsl(var(--sam-live))]", compact ? "bottom-3 right-3" : "bottom-4 right-4")} />
          </div>
          <div>
            <p className={cn("font-display font-bold", compact ? "text-[16px]" : "text-[20px]")}>Sam</p>
            <p className="text-[12px] text-muted-foreground">{pending ? "Thinking…" : "AI social growth agent · Online"}</p>
            {pending && <div className="mt-2"><StopSamButton workspaceId={wsId} background={ideating} stopChat={busy ? stop : undefined} /></div>}
          </div>
        </div>
      </div>

      <div ref={scrollRef} onScroll={(e) => { const el = e.currentTarget; pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 text-[15px]">
        {messages.length === 0 && live.length === 0 && (
          <div className="flex flex-col items-center space-y-4 pt-2 text-center">
            <p className="leading-relaxed">{currentWorkspace?.workspace_kind === "personal" ? "Tell me what you want to be known for, or ask me about your social presence." : needsBrand ? SAM_CREATE_NEEDED : SAM_GREETINGS[module]}</p>
            {needsBrand && currentWorkspace?.workspace_kind !== "personal" && (
              <div className="flex flex-wrap justify-center gap-2">
                  <a href="/app/brand-assets" className="rounded-[10px] bg-ink px-3 py-1.5 text-[13px] font-medium text-inverse hover:bg-ink-hover">Add brand assets</a>
                <a href="/app/dossier" className="rounded-[10px] border border-border-control bg-surface px-3 py-1.5 text-[13px] hover:bg-surface-subtle">Add brand notes</a>
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              {(currentWorkspace?.workspace_kind === "personal" ? ["How do I come across on social media?", "What themes appear across my posts?", "Help me define what I want to be known for."] : needsBrand ? SAM_CREATE_STARTERS : SAM_STARTERS[module]).map((s) => (
                <button key={s} type="button" onClick={() => send(s)}
                  className="rounded-[10px] border border-border-control bg-surface px-3 py-1.5 text-[13px] hover:bg-surface-subtle">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("max-w-[90%]", m.role === "user" ? "ml-auto" : "")}>
            <div className={cn("rounded-[14px] px-3 py-2 leading-relaxed",
              m.role === "user" ? "bg-ink text-inverse whitespace-pre-wrap" : "bg-surface border border-border")}>
              {m.role === "user" ? m.content : ideationIsActive(m) ? (
                <div role="status" className="space-y-1 text-[13px]">
                  <p className="flex items-center gap-2 font-semibold"><span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-ink" />Sam's progress</p>
                  <p className="text-muted-foreground">{m.content.split("\n\n")[1] ?? "Preparing new ideas…"}</p>
                </div>
              ) : m.content.startsWith(IDEATION_PROGRESS_PREFIX) ? (
                <p className="text-[13px] text-muted-foreground">That idea request stopped before finishing. You can try again.</p>
                ) : module === "create" && m.canvas_id && !campaignCanvases.data?.some(canvas => canvas.id === m.canvas_id && Array.isArray(canvas.blocks) && canvas.blocks.some(block => block && typeof block === "object" && !Array.isArray(block) && block["type"] === "content_campaign")) && m.content.length > 420 && !/\b(higgsfield|youtube|seedance|kling|ltx)\b/i.test(m.content) ? (
                <div className="space-y-2 text-[13px]"><p>Sam put these ideas in Live View. Open the preview to skim and select them.</p><details><summary className="cursor-pointer text-muted-foreground">Read Sam’s full explanation</summary><div className={`${MD} mt-2`}><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown></div></details></div>
              ) : (
                <div className={MD}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
              )}
            </div>
            {wsId && campaignCanvases.data?.find(canvas => canvas.id === m.canvas_id) && (() => {
              const blocks = campaignCanvases.data.find(canvas => canvas.id === m.canvas_id)?.blocks;
              if (!Array.isArray(blocks)) return null;
              return blocks.filter((block): block is { type: "content_campaign"; campaignId: string } =>
                !!block && typeof block === "object" && !Array.isArray(block) && block["type"] === "content_campaign" && typeof block["campaignId"] === "string"
              ).map(block => <CampaignCard key={block.campaignId} workspaceId={wsId} campaignId={block.campaignId} />);
            })()}
            {m.role === "user" && /\b(posts|calendar|campaign)\b/i.test(m.content) && /\b(plan|planned|month|week)\b/i.test(m.content) && <button type="button" disabled={busy} onClick={() => void send(`Complete the content plan from my earlier message ${m.id} using its original dates and brief.`)} className="mt-2 rounded-lg border border-border-control px-3 py-2 text-sm font-semibold">Complete this plan</button>}
            <CopyMessage text={m.content} />
            {m.canvas_id && module === "create" && <Link to="/app/create" search={{ stage: "plans", item: `canvas:${m.canvas_id}` }} onClick={() => setMobileView("live")} className="mt-1 inline-flex text-[12px] font-semibold underline underline-offset-2">Open plan</Link>}
            {m.canvas_id && module !== "create" && (
              <button type="button"
                onClick={async () => {
                  const { data: c } = await supabase.from("canvases").select("id,version,title").eq("id", m.canvas_id!).maybeSingle();
                  if (c) {
                    setActiveCanvas(c);
                    setMobileView("live");
                  }
                }}
                className="mt-1 inline-flex items-center gap-1 text-[12px] text-muted-foreground underline underline-offset-2">
                <AppIcon name="liveView" size={14} /> {activeCanvas?.id === m.canvas_id ? "Showing in Live View" : "Show in Live View"}
              </button>
            )}
          </div>
        ))}
        {live.map((m) => <LiveMessage key={m.id} m={m} />)}
        {ideating && !messages.some((m) => ideationIsActive(m)) && (
          <div className="max-w-[90%] rounded-[14px] border border-border bg-surface px-3 py-2 text-[14px]" role="status">Sam is reviewing your brand and preparing new ideas…</div>
        )}
        {status === "submitted" && <p className="text-[13px] text-muted-foreground" role="status">Sam is thinking…</p>}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="shrink-0 border-t border-border p-3">
        <SamAttachmentGrid attachments={photos.attachments} remove={photos.remove} retry={photos.retry} />
        {quotaSupport && <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-border-control bg-surface p-3 text-[13px]">
          <p className="min-w-0 flex-1">AI is temporarily unavailable because the service has run out of credits. Our support team has been notified.{supportSent ? " Your support request has also been sent." : ""}</p>
          {!supportSent && <button type="button" onClick={() => void requestSupport()} disabled={supportSending} className="inline-flex shrink-0 items-center gap-2 rounded-[9px] bg-ink px-3 py-2 font-medium text-inverse hover:bg-ink-hover disabled:opacity-50">
            <LifeBuoy size={15} />{supportSending ? "Sending…" : "Contact support"}
          </button>}
        </div>}
        <p className="mb-2 truncate text-[12px] text-muted-foreground" role={listening ? "status" : undefined}>
          {listening ? "Listening… speak your message, then press the microphone to review it." : `${currentWorkspace?.name ?? "No business"} / ${mod.label}${activeCanvas ? ` / ${activeCanvas.title}` : ""}`}
        </p>
        <div className="rounded-[20px] border border-border-control bg-surface p-3 shadow-sm transition-[border-color,box-shadow] focus-within:border-ink/60 focus-within:ring-2 focus-within:ring-ink/10">
          <textarea
            ref={composerRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
            rows={1}
            placeholder="Ask Sam…"
            aria-label="Message Sam"
            className="block min-h-[44px] max-h-[240px] w-full resize-none overflow-y-auto rounded-none border-0 bg-transparent px-1 py-1 text-[16px] leading-6 text-foreground shadow-none outline-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 md:text-[15px]"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex min-h-9 items-center">
              {module === "create" && <SamAttachButton addFiles={photos.addFiles} disabled={!wsId || busy || creatingThread} />}
            </div>
            <div className="flex items-center gap-2">
          <button type="button" onClick={toggleMicrophone} disabled={busy} aria-label={listening ? "Stop dictation" : "Dictate message"} aria-pressed={listening}
            title={listening ? "Stop dictation" : "Dictate message"}
            className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-border-control hover:bg-surface-subtle disabled:opacity-40", listening && "border-destructive text-destructive")}>
            {listening ? <MicOff size={17} /> : <Mic size={17} />}
          </button>
          {busy ? (
            <button type="button" onClick={() => void stop()} aria-label="Stop Sam"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-ink text-inverse hover:bg-ink-hover">
              <span aria-hidden className="h-3 w-3 rounded-[2px] bg-inverse" />
            </button>
          ) : (
            <button type="submit" disabled={!input.trim() || photos.blocked || creatingThread} aria-label="Send" title={photos.blocked ? "Wait for photos to save, or retry/remove failed photos" : "Send"}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-ink text-inverse hover:bg-ink-hover disabled:opacity-40">
              <AppIcon name="send" size={16} />
            </button>
          )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

const MD = "min-w-0 max-w-full space-y-2 text-[14px] [overflow-wrap:anywhere] [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_strong]:font-semibold [&_h1]:font-display [&_h1]:text-[16px] [&_h1]:font-bold [&_h2]:font-display [&_h2]:text-[15px] [&_h2]:font-bold [&_h3]:font-semibold [&_table]:w-full [&_table]:text-[12px] [&_th]:border-b [&_th]:border-border [&_th]:py-1 [&_th]:text-left [&_td]:border-b [&_td]:border-border [&_td]:py-1 [&_blockquote]:border-l-2 [&_blockquote]:border-ink [&_blockquote]:pl-3 [&_blockquote]:italic [&_pre]:max-w-full [&_pre]:whitespace-pre-wrap [&_pre]:[overflow-wrap:anywhere] [&_code]:whitespace-pre-wrap [&_code]:[overflow-wrap:anywhere] [&_code]:rounded [&_code]:bg-surface-subtle [&_code]:px-1 [&_a]:underline";

function CopyMessage({ text }: { text: string }) {
  return <button type="button" aria-label="Copy message" title="Copy message" onClick={async () => {
    try { await navigator.clipboard.writeText(text); toast.success("Message copied"); }
    catch { toast.error("Could not copy message"); }
  }} className="mt-1 inline-flex items-center gap-1 rounded-[8px] px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-surface-subtle hover:text-foreground"><Copy size={13} aria-hidden />Copy</button>;
}

/** One streaming reply: thinking, tool cards (collapsed) and Markdown text. */
function LiveMessage({ m }: { m: UIMessage }) {
  if (m.role === "user") {
    const t = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
    return <div className="ml-auto max-w-[90%]"><div className="whitespace-pre-wrap rounded-[14px] bg-ink px-3 py-2 leading-relaxed text-inverse">{t}</div>{t && <CopyMessage text={t} />}</div>;
  }
  return (
    <div className="max-w-[90%] space-y-2">
      {m.parts.map((p, i) => {
        if (p.type === "reasoning") {
          return i === m.parts.findIndex((part) => part.type === "reasoning") && p.text.trim() ? (
            <details key={i} className="rounded-[10px] border border-border bg-surface-subtle px-3 py-1.5 text-[12px] text-muted-foreground">
              <summary className="cursor-pointer select-none">Sam's thinking</summary>
              <p className="mt-1 whitespace-pre-wrap">{p.text}</p>
            </details>
          ) : null;
        }
        if (p.type === "text") {
          return p.text ? <div key={i} className="rounded-[14px] border border-border bg-surface px-3 py-2 leading-relaxed"><div className={MD}><ReactMarkdown remarkPlugins={[remarkGfm]}>{p.text}</ReactMarkdown></div><CopyMessage text={p.text} /></div> : null;
        }
        if (p.type.startsWith("tool-")) {
          const name = p.type.slice(5) as keyof typeof SAM_TOOLS;
          const tp = p as { state?: string; output?: { error?: string } };
          const done = tp.state === "output-available";
          const failed = tp.state === "output-error" || !!tp.output?.error;
          return (
            <details key={i} className="rounded-[10px] border-2 border-ink/80 bg-canvas px-3 py-1.5 text-[12px]">
              <summary className="flex cursor-pointer select-none items-center gap-2">
                <span aria-hidden className={cn("h-2 w-2 rounded-full", failed ? "bg-destructive" : done ? "bg-ink" : "animate-pulse bg-muted-foreground")} />
                <span className="font-medium">{SAM_TOOLS[name]?.label ?? name}</span>
                <span className="text-muted-foreground">{failed ? "· couldn't" : done ? "· done" : "· working"}</span>
              </summary>
              {tp.output?.error && <p className="mt-1 text-muted-foreground">{tp.output.error}</p>}
            </details>
          );
        }
        return null;
      })}
    </div>
  );
}

