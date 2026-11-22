import vibeAvatar from "@/assets/vibe-avatar.jpg";
import { cn } from "@/lib/utils";

interface VibeAvatarProps {
  size?: number;
  speaking?: boolean;
  className?: string;
}

/**
 * Vibe's avatar — a calm pink/purple gradient ring with gentle breathing
 * motion. Use everywhere Vibe is personified (Home hero, Ask Vibe, status).
 */
export function VibeAvatar({ size = 168, speaking = false, className }: VibeAvatarProps) {
  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      {/* outer rotating gradient ring */}
      <div
        className="absolute inset-0 rounded-full opacity-90 animate-[spin_20s_linear_infinite]"
        style={{
          background:
            "conic-gradient(from 0deg, hsl(var(--brand-pink)), hsl(var(--brand-purple)), hsl(var(--brand-pink)))",
          padding: 2,
        }}
      >
        <div className="h-full w-full rounded-full bg-background" />
      </div>

      {/* soft glow when speaking */}
      {speaking && (
        <div
          className="absolute inset-[-8px] rounded-full animate-pulse"
          style={{ background: "hsl(var(--brand-pink) / 0.18)", filter: "blur(16px)" }}
        />
      )}

      {/* breathing wrapper */}
      <div
        className="absolute inset-[6px] rounded-full overflow-hidden shadow-[var(--shadow-card)]"
        style={{
          animation: "vibe-breath 4s ease-in-out infinite",
        }}
      >
        <img
          src={vibeAvatar}
          alt="Vibe — your AI creator strategist"
          width={size}
          height={size}
          className="h-full w-full object-cover"
        />
      </div>

      <style>{`
        @keyframes vibe-breath {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.015); }
        }
      `}</style>
    </div>
  );
}
