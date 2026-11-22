import { useNavigate } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BellRing, LogOut, Settings, User } from "lucide-react";

export function AgencyProfileMenu() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const name = profile?.full_name || user?.email?.split("@")[0] || "You";
  const initials = name.slice(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Open profile menu"
        className="flex items-center gap-3 rounded-full py-1 pl-3 pr-1 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="hidden text-right sm:block">
          <span className="block max-w-[160px] truncate text-sm font-semibold text-foreground">{name}</span>
          <span className="block text-[11px] text-muted-foreground">Agency</span>
        </span>
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-xs font-semibold text-inverse">{initials}</span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="truncate text-xs font-normal text-muted-foreground">{user?.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("/agency/profile")}><User className="mr-2 h-4 w-4" />My profile</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate("/agency/settings")}><Settings className="mr-2 h-4 w-4" />Agency settings</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate("/agency/notifications")}><BellRing className="mr-2 h-4 w-4" />Notifications</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={async () => { await signOut(); navigate("/auth"); }}><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
