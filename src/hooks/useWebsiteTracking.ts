import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "as_session_id";
const ANON_KEY = "as_anonymous_id";
const ENTRY_KEY = "as_entry_tracked";

function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function getAnonymousId(): string {
  let id = localStorage.getItem(ANON_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(ANON_KEY, id);
  }
  return id;
}

function getUtmParams(): Record<string, string | null> {
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get("utm_source"),
    utm_medium: params.get("utm_medium"),
    utm_campaign: params.get("utm_campaign"),
    utm_term: params.get("utm_term"),
    utm_content: params.get("utm_content"),
  };
}

function getPageLoadTime(): number | null {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav) return Math.round(nav.loadEventEnd - nav.startTime);
  } catch {}
  return null;
}

function isEntryPage(): boolean {
  if (sessionStorage.getItem(ENTRY_KEY)) return false;
  sessionStorage.setItem(ENTRY_KEY, "1");
  return true;
}

// Standalone event tracking
export async function trackEngagementEvent(
  eventType: string,
  eventData?: Record<string, unknown>
) {
  const sessionId = getSessionId();
  const anonymousId = getAnonymousId();
  const pagePath = window.location.pathname;

  await supabase.from("website_engagement_events" as any).insert({
    session_id: sessionId,
    anonymous_id: anonymousId,
    page_path: pagePath,
    event_type: eventType,
    event_data: eventData || null,
  });
}

export function useWebsiteTracking(pagePath?: string) {
  const pageViewIdRef = useRef<string | null>(null);
  const startTimeRef = useRef(Date.now());
  const scrollMaxRef = useRef(0);
  const scroll25Ref = useRef(false);
  const scroll50Ref = useRef(false);
  const scroll75Ref = useRef(false);
  const scroll100Ref = useRef(false);
  const ctaVisibleRef = useRef(false);
  const ctaClickedRef = useRef(false);
  const isBounceRef = useRef(true);
  const rageClicksRef = useRef(0);
  const deadClicksRef = useRef(0);
  const clickTimesRef = useRef<{ target: EventTarget | null; time: number }[]>([]);
  const updateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolvedPath = pagePath || window.location.pathname;

  const calcEngagement = useCallback(() => {
    const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
    // Time: up to 30 pts for 60s+
    const timePts = Math.min(30, Math.round((elapsed / 60) * 30));
    // Scroll: up to 30 pts for 100%
    const scrollPts = Math.round((scrollMaxRef.current / 100) * 30);
    // CTA: 20 pts if clicked
    const ctaPts = ctaClickedRef.current ? 20 : ctaVisibleRef.current ? 5 : 0;
    // Low bounce: 20 pts if not bounce
    const bouncePts = !isBounceRef.current ? 20 : 0;
    return Math.min(100, timePts + scrollPts + ctaPts + bouncePts);
  }, []);

  const buildUpdatePayload = useCallback(() => {
    const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
    return {
      time_on_page_seconds: elapsed,
      scroll_depth_max: scrollMaxRef.current,
      scroll_depth_25: scroll25Ref.current,
      scroll_depth_50: scroll50Ref.current,
      scroll_depth_75: scroll75Ref.current,
      scroll_depth_100: scroll100Ref.current,
      engagement_score: calcEngagement(),
      is_bounce: isBounceRef.current,
      cta_visible: ctaVisibleRef.current,
      cta_clicked: ctaClickedRef.current,
      rage_clicks: rageClicksRef.current,
      dead_clicks: deadClicksRef.current,
    };
  }, [calcEngagement]);

  const flushUpdate = useCallback(() => {
    const id = pageViewIdRef.current;
    if (!id) return;
    const payload = buildUpdatePayload();
    
    // Use sendBeacon for reliability
    const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/website_page_views?id=eq.${id}`;
    const headers = {
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    };
    
    try {
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      const headerEntries = Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join("\r\n");
      // sendBeacon doesn't support custom headers, so use fetch with keepalive
      fetch(url, {
        method: "PATCH",
        headers,
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // silent fail
    }
  }, [buildUpdatePayload]);

  const throttledUpdate = useCallback(() => {
    const id = pageViewIdRef.current;
    if (!id) return;
    const payload = buildUpdatePayload();
    supabase
      .from("website_page_views" as any)
      .update(payload)
      .eq("id", id)
      .then(() => {});
  }, [buildUpdatePayload]);

  useEffect(() => {
    const sessionId = getSessionId();
    const anonymousId = getAnonymousId();
    const utms = getUtmParams();

    // Create page view
    const createPageView = async () => {
      const { data } = await supabase
        .from("website_page_views" as any)
        .insert({
          session_id: sessionId,
          anonymous_id: anonymousId,
          page_path: resolvedPath,
          page_title: document.title,
          referrer: document.referrer || null,
          ...utms,
          user_agent: navigator.userAgent,
          screen_width: window.screen.width,
          screen_height: window.screen.height,
          language: navigator.language,
          is_entry_page: isEntryPage(),
          page_load_time_ms: getPageLoadTime(),
        })
        .select("id")
        .single();

      if (data) {
        pageViewIdRef.current = (data as any).id;
      }
    };

    createPageView();

    // Scroll tracking
    const handleScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      ) - window.innerHeight;
      if (docHeight <= 0) return;
      const pct = Math.min(100, Math.round((scrollTop / docHeight) * 100));
      if (pct > scrollMaxRef.current) scrollMaxRef.current = pct;
      if (pct >= 25) {
        scroll25Ref.current = true;
        if (isBounceRef.current) isBounceRef.current = false;
      }
      if (pct >= 50) scroll50Ref.current = true;
      if (pct >= 75) scroll75Ref.current = true;
      if (pct >= 100) scroll100Ref.current = true;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    // Bounce timer: after 10s, not a bounce
    bounceTimerRef.current = setTimeout(() => {
      isBounceRef.current = false;
    }, 10_000);

    // CTA tracking
    const ctaObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) ctaVisibleRef.current = true;
        });
      },
      { threshold: 0.5 }
    );

    // Observe CTAs after short delay for DOM to settle
    const ctaTimeout = setTimeout(() => {
      document.querySelectorAll("[data-cta]").forEach((el) => ctaObserver.observe(el));
    }, 1000);

    const handleCtaClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-cta]")) {
        ctaClickedRef.current = true;
        isBounceRef.current = false;
      }
    };

    // Dead click detection
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const tag = target.tagName.toLowerCase();
      const isInteractive =
        tag === "a" ||
        tag === "button" ||
        tag === "input" ||
        tag === "select" ||
        tag === "textarea" ||
        target.closest("a, button, input, select, textarea, [role='button'], [data-cta]");

      if (!isInteractive) {
        deadClicksRef.current += 1;
      }

      // Rage click detection
      const now = Date.now();
      clickTimesRef.current.push({ target: e.target, time: now });
      clickTimesRef.current = clickTimesRef.current.filter((c) => now - c.time < 500);
      if (clickTimesRef.current.length >= 3) {
        rageClicksRef.current += 1;
        clickTimesRef.current = [];
      }
    };

    document.addEventListener("click", handleCtaClick, true);
    document.addEventListener("click", handleClick, true);

    // Periodic update every 5 seconds
    updateTimerRef.current = setInterval(throttledUpdate, 5000);

    // Page exit handlers
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushUpdate();
    };
    const handlePageHide = () => flushUpdate();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      flushUpdate();
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("click", handleCtaClick, true);
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      if (updateTimerRef.current) clearInterval(updateTimerRef.current);
      if (bounceTimerRef.current) clearTimeout(bounceTimerRef.current);
      clearTimeout(ctaTimeout);
      ctaObserver.disconnect();
    };
  }, [resolvedPath, throttledUpdate, flushUpdate]);
}
