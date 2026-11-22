import {
  BookOpen, CalendarClock, Clapperboard, History, Maximize2, Megaphone, PanelRight, Pause, Play,
  Plug, Plus, Repeat2, Search, Settings, TriangleAlert, Trophy, CreditCard, Shield, LogOut, FolderOpen,
  Check, X, ArrowUp, Users, UserCog, ScanEye, Mail,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Fixed icon registry — the only icons used in the workspace shell. */
export const ICONS = {
  create: Clapperboard,
  schedule: CalendarClock,
  winners: Trophy,
  campaigns: Megaphone,
  outreach: Mail,
  learn: Repeat2,
  connections: Plug,
  knowledge: BookOpen,
  assets: FolderOpen,
  research: ScanEye,
  settings: Settings,
  search: Search,
  new: Plus,
  liveView: PanelRight,
  focus: Maximize2,
  pause: Pause,
  resume: Play,
  activity: History,
  warning: TriangleAlert,
  billing: CreditCard,
  admin: Shield,
  signOut: LogOut,
  check: Check,
  close: X,
  send: ArrowUp,
  team: Users,
  switchUser: UserCog,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function AppIcon({ name, size = 18, className, label }: { name: IconName; size?: number; className?: string; label?: string }) {
  const Icon = ICONS[name];
  return (
    <Icon
      width={size}
      height={size}
      strokeWidth={1.75}
      className={cn("shrink-0", className)}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    />
  );
}
