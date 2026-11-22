import { useState } from "react";
import icon from "@/assets/icon-white.png";
import { BrandMark } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";
import { CopyChip } from "./parts";

type Bg = "canvas" | "surface" | "ink";
type Variant = "mark" | "horizontal" | "stacked";
const LOGOS: { name: string; variant: Variant; reversed: boolean; bgs: Bg[]; use: string; min: string }[] = [
  { name: "Horizontal logo", variant: "horizontal", reversed: false, bgs: ["canvas", "surface"], use: "Default logo for headers, emails and documents on ivory or white.", min: "120px wide" },
  { name: "Horizontal logo — white", variant: "horizontal", reversed: true, bgs: ["ink"], use: "Carbon navigation and dark placements.", min: "120px wide" },
  { name: "Stacked logo", variant: "stacked", reversed: false, bgs: ["canvas", "surface"], use: "Square placements: sign-in, social avatars and splash screens.", min: "80px wide" },
  { name: "Stacked logo — white", variant: "stacked", reversed: true, bgs: ["ink"], use: "Square placements on carbon.", min: "80px wide" },
  { name: "Hand icon", variant: "mark", reversed: false, bgs: ["canvas", "surface"], use: "App icon, favicon, compact navigation and Sam-adjacent marks.", min: "16px" },
  { name: "Hand icon — white", variant: "mark", reversed: true, bgs: ["ink"], use: "Icon on carbon surfaces such as the collapsed navigation rail.", min: "16px" },
];
const BG_CLASS: Record<Bg, string> = { canvas: "bg-canvas", surface: "bg-surface", ink: "bg-ink" };
const BG_LABEL: Record<Bg, string> = { canvas: "Ivory", surface: "White", ink: "Carbon" };
const BG_HEX: Record<Bg, string> = { canvas: "#F5F3EE", surface: "#FFFFFF", ink: "#171715" };

async function downloadLogo(variant: Variant, reversed: boolean, bg?: Bg, square = false) {
  const img = new Image();
  img.src = icon;
  await img.decode();
  const mark = variant === "mark";
  const markSize = square ? 560 : mark ? 512 : variant === "stacked" ? 360 : 180;
  const gap = mark ? 0 : 28;
  const canvas = document.createElement("canvas");
  canvas.width = square ? 1024 : mark ? markSize : variant === "stacked" ? 520 : 900;
  canvas.height = square ? 1024 : variant === "stacked" ? 560 : markSize + 48;
  const ctx = canvas.getContext("2d")!;
  if (bg) { ctx.fillStyle = BG_HEX[bg]; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.filter = reversed ? "brightness(0) invert(1)" : "none";
  if (variant === "stacked") {
    ctx.drawImage(img, (canvas.width - markSize) / 2, square ? 170 : 20, markSize, markSize);
    ctx.fillStyle = reversed ? "#FFFFFF" : "#171715";
    ctx.font = square ? "700 105px Arial, sans-serif" : "700 54px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("AutoSocials", canvas.width / 2, square ? 825 : 500);
  } else {
    const x = mark ? 0 : 24;
    ctx.drawImage(img, x, (canvas.height - markSize) / 2, markSize, markSize);
    if (!mark) {
      ctx.filter = "none";
      ctx.fillStyle = reversed ? "#FFFFFF" : "#171715";
      ctx.font = "700 72px Arial, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("AutoSocials", markSize + gap, canvas.height / 2 + 24);
    }
  }
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), "image/png"));
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `autosocials-${variant}${reversed ? "-white" : ""}${square ? "-1024" : ""}${bg ? `-${BG_LABEL[bg].toLowerCase()}` : ""}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function LogoPreview({ variant, reversed }: { variant: Variant; reversed: boolean }) {
  const markSize = variant === "mark" ? 68 : variant === "stacked" ? 76 : 52;
  return (
    <div className={cn("flex items-center justify-center gap-2", variant === "stacked" && "flex-col gap-1", reversed ? "text-white" : "text-ink")}>
      <BrandMark size={markSize} reversed={reversed} />
      {variant !== "mark" && <span className="font-display text-xl font-extrabold tracking-tight">AutoSocials</span>}
    </div>
  );
}

export function LogosTab() {
  return (
    <div className="space-y-6 pt-6">
      <div className="max-w-2xl text-[14px] text-text-secondary">
        The AutoSocials hand logo in solid carbon (#171715), with white versions for carbon surfaces. These replace the
        previous purple logo; the purple version is retired and should not be used. Favicon and app icon are generated from the hand icon.
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {LOGOS.map((logo) => (
          <article key={logo.name} className="overflow-hidden rounded-[14px] border border-border bg-surface">
            <div className={cn("grid", logo.bgs.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
              {logo.bgs.map((bg) => (
                <div key={bg} className={cn("relative flex h-44 items-center justify-center p-6", BG_CLASS[bg])}>
                  <LogoPreview variant={logo.variant} reversed={logo.reversed} />
                  <span className={cn("absolute left-2 top-2 text-[11px]", bg === "ink" ? "text-silver" : "text-muted-foreground")}>{BG_LABEL[bg]}</span>
                </div>
              ))}
            </div>
            <div className="space-y-2 border-t border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="font-display text-[15px] font-bold text-ink">{logo.name}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {logo.variant === "stacked" && !logo.reversed && <button type="button" onClick={() => void downloadLogo("stacked", false, "surface", true)} className="shrink-0 rounded-[10px] border border-border-control px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-surface-subtle">1024 × 1024 PNG</button>}
                  <button type="button" onClick={() => void downloadLogo(logo.variant, logo.reversed)} className="shrink-0 rounded-[10px] border border-border-control px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-surface-subtle">Transparent PNG</button>
                  {logo.bgs.map((bg) => <button key={bg} type="button" onClick={() => void downloadLogo(logo.variant, logo.reversed, bg)} className="shrink-0 rounded-[10px] border border-border-control px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-surface-subtle">PNG on {BG_LABEL[bg]}</button>)}
                </div>
              </div>
              <p className="text-[13px] text-text-secondary">{logo.use}</p>
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground"><CopyChip value={`autosocials-${logo.variant}${logo.reversed ? "-white" : ""}.png`} what="file name" /><span>PNG · min {logo.min}</span></div>
            </div>
          </article>
        ))}
      </div>
      <div className="rounded-[14px] border border-border bg-canvas p-4 text-[13px] text-text-secondary">
        <strong className="text-ink">Rules.</strong> Keep clear space equal to the eye&apos;s diameter around the logo. Never recolour it to green,
        blue, purple, pink or orange; never add gradients, outlines or shadows. On photos, place it on a carbon or ivory panel. Code component:
        <span className="ml-1"><CopyChip value="<Logo />" what="component" /></span> / <span className="ml-1"><CopyChip value="<BrandMark />" what="component" /></span> from <CopyChip value="@/components/brand/Logo" what="import path" />.
      </div>
    </div>
  );
}
