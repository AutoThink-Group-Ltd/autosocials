import { Link } from "@/lib/router-compat";
import logoWhite from "@/assets/logo-white.png";
import logoDark from "@/assets/logo-dark.png";

const Footer = () => {

  return (
    <footer className="border-t border-border py-12">
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <img src={logoWhite} alt="AutoSocials" className="h-12 w-auto object-contain dark:block hidden" />
          <img src={logoDark} alt="AutoSocials" className="h-12 w-auto object-contain dark:hidden block" />
        </div>
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
          <a href="#how-it-works" className="hover:text-foreground transition-colors">How it works</a>
          <a href="#platforms" className="hover:text-foreground transition-colors">Platforms</a>
        </div>
        <p className="text-xs text-muted-foreground">© 2026 AutoSocials. All rights reserved.</p>
      </div>
    </footer>
  );
};

export default Footer;
