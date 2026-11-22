import { cn } from "@/lib/utils";
import icon from "@/assets/icon-white.png";

/**
 * AutoSocials hand mark (recoloured solid carbon, brand release 1.0.0).
 * `reversed` selects the white version for carbon surfaces.
 */
export function BrandMark({ size = 24, reversed = false, className }: { size?: number; reversed?: boolean; className?: string }) {
  return (
    <img
      src={icon}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      className={cn("shrink-0 object-contain", reversed && "brightness-0 invert", className)}
      style={{ width: size, height: size }}
    />
  );
}

/** @deprecated kept as an alias so older callers keep working. */
export const SMark = ({ size = 24, className }: { size?: number; twoTone?: boolean; className?: string }) => (
  <BrandMark size={size} {...(className ? { className } : {})} />
);

export function Logo({ reversed = false, size = 22, className }: { reversed?: boolean; size?: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-display font-extrabold tracking-[-0.02em]",
        reversed ? "text-inverse" : "text-foreground",
        className,
      )}
      style={{ fontSize: size * 0.8 }}
      aria-label="AutoSocials"
    >
      <BrandMark size={size * 1.15} reversed={reversed} />
      <span aria-hidden="true">AutoSocials</span>
    </span>
  );
}
