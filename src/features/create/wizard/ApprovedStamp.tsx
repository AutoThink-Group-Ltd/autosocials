/** Animated on-brand approval stamp: ring draws in, tick follows, a soft burst ripples out. */
export function ApprovedStamp({ size = 84 }: { size?: number }) {
  return (
    <div className="stamp-pop relative grid place-items-center" style={{ width: size, height: size }} role="img" aria-label="Approved">
      <span className="stamp-burst absolute inset-0 rounded-full border-2 border-ink" aria-hidden />
      <svg viewBox="0 0 60 60" className="relative h-full w-full drop-shadow-md" aria-hidden>
        <circle cx="30" cy="30" r="27" className="fill-ink" />
        <circle cx="30" cy="30" r="24" fill="none" strokeWidth="1.5" className="stamp-ring stroke-inverse" style={{ transform: "rotate(-90deg)", transformOrigin: "center" }} />
        <path d="M19 30.5l7 7 15-15" fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="stamp-tick stroke-inverse" />
      </svg>
      <span className="absolute -bottom-1 rounded-full border-2 border-ink bg-canvas px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em]" style={{ fontSize: Math.max(9, size / 9) }}>Approved</span>
    </div>
  );
}
