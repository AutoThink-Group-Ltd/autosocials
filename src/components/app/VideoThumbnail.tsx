import { useEffect, useState } from "react";
import { X } from "lucide-react";

interface VideoThumbnailProps {
  thumbnailUrl: string | null;
  fallbackGradient: string;
  alt: string;
  videoUrl: string | null;
  fallbackImageUrl?: string | null;
}

const VideoThumbnail = ({ thumbnailUrl, fallbackGradient, alt, videoUrl: _videoUrl, fallbackImageUrl }: VideoThumbnailProps) => {
  const [hasImageError, setHasImageError] = useState(false);
  const [hasFallbackError, setHasFallbackError] = useState(false);

  useEffect(() => {
    setHasImageError(false);
    setHasFallbackError(false);
  }, [thumbnailUrl, fallbackImageUrl]);

  const showPrimary = Boolean(thumbnailUrl) && !hasImageError;
  const showFallback = !showPrimary && Boolean(fallbackImageUrl) && !hasFallbackError;

  return (
    <div className="absolute inset-0 w-full h-full">
      {showPrimary ? (
        <img
          src={thumbnailUrl!}
          alt={alt}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setHasImageError(true)}
        />
      ) : showFallback ? (
        <img
          src={fallbackImageUrl!}
          alt={alt}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setHasFallbackError(true)}
        />
      ) : (
        <div className={`absolute inset-0 w-full h-full bg-gradient-to-br ${fallbackGradient}`} />
      )}
    </div>
  );
};

export function VideoPlayerModal({ videoUrl, onClose }: { videoUrl: string; onClose: () => void }) {
  const match = videoUrl.match(/video\/(\d+)/);
  if (!match) return null;

  const embedHtml = `
    <!DOCTYPE html>
    <html><head><style>
      * { margin: 0; padding: 0; }
      body { background: #000; display: flex; align-items: center; justify-content: center; height: 100vh; overflow: hidden; }
      blockquote { max-width: 100%; margin: 0 auto; }
    </style></head>
    <body>
      <blockquote class="tiktok-embed" cite="${videoUrl}" data-video-id="${match[1]}" style="max-width:100%;">
        <section></section>
      </blockquote>
      <script async src="https://www.tiktok.com/embed.js"></script>
    </body></html>
  `;

  return (
    <div
      className="fixed inset-0 z-50 bg-foreground/80 backdrop-blur-sm flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="relative w-[400px] h-[720px] max-h-[90vh] max-w-[90vw] rounded-2xl overflow-hidden bg-background shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-card/90 backdrop-blur-sm flex items-center justify-center text-foreground hover:bg-card transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        <iframe
          srcDoc={embedHtml}
          className="w-full h-full border-0"
          allow="autoplay; encrypted-media; fullscreen"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        />
      </div>
    </div>
  );
}

export default VideoThumbnail;
