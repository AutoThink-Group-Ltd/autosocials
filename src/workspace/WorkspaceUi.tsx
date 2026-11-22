import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { DEFAULT_LAYOUT, type WorkspaceLayout } from "@/lib/landing";

export type ActiveCanvas = { id: string; version: number; title: string } | null;
export type YouTubeInitial = { videoIds?: string[]; selectedVideoId?: string; query?: string; channelId?: string };

type Ctx = {
  activeCanvas: ActiveCanvas;
  setActiveCanvas: (c: ActiveCanvas) => void;
  youtube: YouTubeInitial | null;
  openYouTube: (initial?: YouTubeInitial) => void;
  closeYouTube: () => void;
  mobileView: "work" | "sam" | "live";
  setMobileView: (v: "work" | "sam" | "live") => void;
  layout: WorkspaceLayout;
  updateLayout: (patch: Partial<WorkspaceLayout>) => void;
};

const LAYOUT_KEY = "as_workspace_layout";
const WorkspaceUiContext = createContext<Ctx | null>(null);

export function WorkspaceUiProvider({ children }: { children: ReactNode }) {
  const [activeCanvas, setCanvas] = useState<ActiveCanvas>(null);
  const [youtube, setYouTube] = useState<YouTubeInitial | null>(null);
  const [mobileView, setMobileView] = useState<"work" | "sam" | "live">("live");
  const closeYouTube = useCallback(() => setYouTube(null), []);
  const openYouTube = useCallback((initial: YouTubeInitial = {}) => {
    setYouTube(initial);
    setMobileView("live");
  }, []);
  const setActiveCanvas = useCallback((canvas: ActiveCanvas) => {
    setCanvas(canvas);
    setYouTube(null);
  }, []);
  const [layout, setLayout] = useState<WorkspaceLayout>(DEFAULT_LAYOUT);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAYOUT_KEY);
      if (raw) setLayout({ ...DEFAULT_LAYOUT, ...(JSON.parse(raw) as Partial<WorkspaceLayout>) });
    } catch { /* ignore */ }
  }, []);

  const updateLayout = useCallback((patch: Partial<WorkspaceLayout>) => {
    setLayout((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  return (
    <WorkspaceUiContext.Provider value={{ activeCanvas, setActiveCanvas, youtube, openYouTube, closeYouTube, mobileView, setMobileView, layout, updateLayout }}>
      {children}
    </WorkspaceUiContext.Provider>
  );
}

export function useWorkspaceUi() {
  const c = useContext(WorkspaceUiContext);
  if (!c) throw new Error("useWorkspaceUi outside provider");
  return c;
}

/** For surfaces that can also render outside the workspace shell (e.g. admin panes). */
export function useWorkspaceUiOptional() {
  return useContext(WorkspaceUiContext);
}
