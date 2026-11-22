import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import icon from "@/assets/icon-white.png";
import { cn } from "@/lib/utils";

/** Autoplaying video with a branded holding screen — never shows a stretched first frame. */
export function BrandedVideo({ src, thumbnail, downloadUrl, name, fill }: { src: string; thumbnail?: string | null | undefined; downloadUrl?: string | null | undefined; name: string; /** Fill the parent (which sets the true aspect) instead of a 16:9 frame. */ fill?: boolean }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  useEffect(() => setThumbnailFailed(false), [thumbnail]);
  return (
    <div className={cn("relative w-full overflow-hidden bg-ink", fill ? "h-full" : "mb-4 aspect-video rounded-[12px]")}>
      {!failed && (
        <video
          key={src}
          src={src}
          autoPlay
          muted
          playsInline
          controls={ready}
          preload="auto"
          onPlaying={() => setReady(true)}
          onCanPlay={() => setReady(true)}
          onError={() => setFailed(true)}
          className={cn("absolute inset-0 h-full w-full object-contain transition-opacity duration-500", ready ? "opacity-100" : "opacity-0")}
        />
      )}
      {(!ready || failed) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-inverse">
          {thumbnail && !thumbnailFailed && <img src={thumbnail} alt="" aria-hidden onError={() => setThumbnailFailed(true)} className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-md" />}
          <div className="absolute inset-0 bg-ink/60" />
          <img src={icon} alt="AutoSocials" className={cn("relative h-10 w-10 brightness-0 invert", !failed && "animate-pulse")} />
          {failed ? (
            <div className="relative flex flex-col items-center gap-2 text-[13px]">
              <p>Couldn't play this video</p>
              {downloadUrl && <a href={downloadUrl} download={name} className="inline-flex items-center gap-1.5 rounded-full bg-inverse px-3 py-1.5 font-semibold text-ink"><Download className="h-3.5 w-3.5" />Download</a>}
            </div>
          ) : (
            <p className="relative animate-pulse text-[12px] tracking-wide opacity-80">Loading video…</p>
          )}
        </div>
      )}
    </div>
  );
}
