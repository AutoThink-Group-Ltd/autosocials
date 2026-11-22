import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/Logo";

const LINKS = [
  { href: "#blueprint", label: "The blueprint" },
  { href: "#sam", label: "Meet Sam" },
  { href: "#workspace", label: "Workspace" },
  { href: "#examples", label: "Examples" },
  { href: "/pricing", label: "Pricing" },
];

export function PublicNav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-canvas">
      <div className="mx-auto flex max-w-[1240px] items-center justify-between px-5 py-4 md:px-8">
        <Link to="/" aria-label="AutoSocials home"><Logo size={26} /></Link>
        <nav aria-label="Primary" className="flex items-center gap-1 text-[14px] md:gap-6">
          {LINKS.map((l) => <a key={l.href} href={l.href} className="hidden text-text-secondary hover:text-ink md:inline">{l.label}</a>)}
          <Link to="/auth" className="hidden px-2 text-text-secondary hover:text-ink sm:inline">Sign in</Link>
          <Link to="/auth" className="rounded-[10px] bg-ink px-4 py-2.5 font-semibold text-inverse hover:bg-ink-hover">Get started</Link>
          <button type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}
            className="ml-1 flex h-11 w-11 items-center justify-center md:hidden">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>
      </div>
      {open && (
        <nav aria-label="Mobile" className="max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain border-t border-border bg-canvas px-5 pb-4 md:hidden">
          {LINKS.map((l) => <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block py-3 text-[16px]">{l.label}</a>)}
          <Link to="/auth" className="block py-3 text-[16px]">Sign in</Link>
        </nav>
      )}
    </header>
  );
}
