import { useState } from "react";
import { Play } from "lucide-react";

function embedUrl(platform: string, permalink: string | null): string | null {
  if (!permalink) return null;
  try {
    const url = new URL(permalink);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (platform === "tiktok" && (host === "tiktok.com" || host.endsWith(".tiktok.com"))) {
      const id = url.pathname.match(/\/video\/(\d+)/)?.[1];
      return id ? `https://www.tiktok.com/embed/v2/${id}` : null;
    }
    if (platform === "youtube" && (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be")) {
      const id = host === "youtu.be" ? url.pathname.slice(1) : url.searchParams.get("v") || url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1];
      return id && /^[\w-]{11}$/.test(id) ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (platform === "instagram" && (host === "instagram.com" || host.endsWith(".instagram.com"))) {
      const path = url.pathname.match(/^\/(p|reel|tv)\/([\w-]+)\/?/) ;
      return path ? `https://www.instagram.com/${path[1]}/${path[2]}/embed/` : null;
    }
    if (platform === "facebook" && (host === "facebook.com" || host.endsWith(".facebook.com"))) return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url.origin + url.pathname)}&show_text=false`;
    if (platform === "x" && ["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(host)) {
      const id = url.pathname.match(/\/status\/(\d+)/)?.[1];
      return id ? `https://platform.twitter.com/embed/Tweet.html?id=${id}` : null;
    }
  } catch { /* Invalid provider URLs cannot be embedded. */ }
  return null;
}

export function FeedVideo({ platform, permalink, mediaUrl, thumbnail }: { platform: string; permalink: string | null; mediaUrl?: string | null; thumbnail?: string | null }) {
  const [playing, setPlaying] = useState(false);
  const embed = embedUrl(platform, permalink);
  const direct = mediaUrl && mediaUrl !== thumbnail && (platform === "instagram" || platform === "x") ? mediaUrl : null;
  if (!direct && !embed) return <p className="p-4 text-sm text-muted-foreground">In-app playback is unavailable for this post. Open the original to watch.</p>;
  if (playing) return direct ? <video src={direct} poster={thumbnail ?? undefined} controls autoPlay playsInline className="max-h-[70vh] w-full bg-black" /> : <iframe src={embed!} title={`${platform} video player`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen className="min-h-[480px] w-full border-0" />;
  return <button type="button" onClick={() => setPlaying(true)} className="relative block w-full bg-muted" aria-label="Play video in AutoSocials">{thumbnail && <img src={thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" className="max-h-[440px] w-full object-contain" />}<span className="absolute inset-0 flex items-center justify-center"><span className="rounded-full bg-background/90 p-4"><Play className="size-6" /></span></span>{!thumbnail && <span className="block p-12">Play video</span>}</button>;
}
