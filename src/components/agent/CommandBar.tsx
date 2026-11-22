import { useEffect, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Sparkles, Compass, Users, MessageSquare, Mail, BarChart3,
  Settings, CreditCard, Workflow, Megaphone, Activity, Shield,
} from "lucide-react";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";

/**
 * Global Command Bar — the Command Layer of the AutoSocials UX OS.
 *
 * Opens with ⌘K / Ctrl-K. Accepts free-form intent (routed to Ask Vibe)
 * or fast-path navigation. Always reachable; never blocks underlying UI.
 */
export function CommandBar() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { isSuperAdmin } = useSuperAdmin();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const go = (path: string) => { setOpen(false); setQuery(""); navigate(path); };
  const askVibe = () => {
    setOpen(false);
    const q = query.trim();
    setQuery("");
    navigate(q ? `/app/ask-vibe?q=${encodeURIComponent(q)}` : "/app/ask-vibe");
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Ask Vibe or jump to…  (try: 'find vegan chefs in LA')"
        value={query}
        onValueChange={setQuery}
        onKeyDown={(e) => {
          if (e.key === "Enter" && query.trim() && !e.defaultPrevented) {
            e.preventDefault();
            askVibe();
          }
        }}
      />
      <CommandList>
        <CommandEmpty>No matches. Press Enter to ask Vibe.</CommandEmpty>

        {query.trim() && (
          <>
            <CommandGroup heading="Ask the agent">
              <CommandItem onSelect={askVibe}>
                <Sparkles className="mr-2 h-4 w-4 text-primary" />
                <span className="truncate">Ask Vibe: <span className="font-medium">{query}</span></span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Go to">
          <CommandItem onSelect={() => go("/app")}>
            <Compass className="mr-2 h-4 w-4" /> Discover
          </CommandItem>
          <CommandItem onSelect={() => go("/app/ask-vibe")}>
            <Sparkles className="mr-2 h-4 w-4" /> Ask Vibe
          </CommandItem>
          <CommandItem onSelect={() => go("/app/lists")}>
            <Users className="mr-2 h-4 w-4" /> Creator Lists
          </CommandItem>
          <CommandItem onSelect={() => go("/app/messages")}>
            <MessageSquare className="mr-2 h-4 w-4" /> Messages
          </CommandItem>
          <CommandItem onSelect={() => go("/app/templates")}>
            <Mail className="mr-2 h-4 w-4" /> Templates
          </CommandItem>
          <CommandItem onSelect={() => go("/app/brand-intelligence")}>
            <Megaphone className="mr-2 h-4 w-4" /> Brand Intel
          </CommandItem>
          <CommandItem onSelect={() => go("/app/insights")}>
            <BarChart3 className="mr-2 h-4 w-4" /> Insights
          </CommandItem>
          <CommandItem onSelect={() => go("/app/activity")}>
            <Activity className="mr-2 h-4 w-4" /> Activity
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Account">
          <CommandItem onSelect={() => go("/app/settings")}>
            <Settings className="mr-2 h-4 w-4" /> Settings
          </CommandItem>
          <CommandItem onSelect={() => go("/app/billing")}>
            <CreditCard className="mr-2 h-4 w-4" /> Billing
          </CommandItem>
        </CommandGroup>

        {isSuperAdmin && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Admin">
              <CommandItem onSelect={() => go("/app/admin")}>
                <Shield className="mr-2 h-4 w-4" /> Admin Panel
              </CommandItem>
              <CommandItem onSelect={() => go("/app/admin/traces")}>
                <Workflow className="mr-2 h-4 w-4" /> Agent Traces
              </CommandItem>
              <CommandItem onSelect={() => go("/app/admin/brand-guidelines")}>
                <Sparkles className="mr-2 h-4 w-4" /> Brand Guidelines
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
