import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Link } from "@/lib/router-compat";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import logoWhite from "@/assets/logo-white.png";
import logoDark from "@/assets/logo-dark.png";

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <img src={logoWhite} alt="AutoSocials" className="h-20 w-auto object-contain dark:block hidden" />
          <img src={logoDark} alt="AutoSocials" className="h-20 w-auto object-contain dark:hidden block" />
        </Link>

        <div className="hidden md:flex items-center gap-8">
          <Link to="/discover" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Discover</Link>
          <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">How it works</a>
          <a href="#platforms" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Platforms</a>
          <a href="#who-its-for" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Who it's for</a>
          <Link to="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</Link>
        </div>

        <div className="hidden md:flex items-center gap-3">
          <ThemeToggle />
          <Link to="/app">
            <Button variant="ghost" size="sm">Log in</Button>
          </Link>
          <Link to="/app">
            <Button variant="brand" size="sm">Start Free</Button>
          </Link>
        </div>

        <button type="button" aria-label={mobileOpen ? "Close menu" : "Open menu"} aria-expanded={mobileOpen} aria-controls="landing-mobile-menu" className="flex h-11 w-11 items-center justify-center md:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div id="landing-mobile-menu" className="max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain bg-background border-b border-border px-6 py-4 space-y-3 md:hidden">
          <Link to="/discover" className="block text-sm text-muted-foreground">Discover</Link>
          <a href="#how-it-works" className="block text-sm text-muted-foreground">How it works</a>
          <a href="#platforms" className="block text-sm text-muted-foreground">Platforms</a>
          <a href="#who-its-for" className="block text-sm text-muted-foreground">Who it's for</a>
          <Link to="/pricing" className="block text-sm text-muted-foreground">Pricing</Link>
          <div className="pt-3 flex gap-3">
            <Link to="/app"><Button variant="ghost" size="sm">Log in</Button></Link>
            <Link to="/app"><Button variant="brand" size="sm">Start Free</Button></Link>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
