import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/brand/Logo";

export function PublicFooter() {
  return (
    <footer className="bg-ink text-silver">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:px-8">
        <div>
          <Logo reversed size={24} />
          <p className="mt-4 max-w-xs text-[14px] leading-relaxed">Organic content. Paid growth. On repeat. Sam is an AI agent that runs the cycle within the limits you set.</p>
          <Link to="/auth" className="mt-5 inline-flex h-11 items-center rounded-[10px] bg-canvas px-5 text-[14px] font-semibold text-ink hover:bg-surface-subtle">Put Sam to work</Link>
        </div>
        <FooterCol title="Product" links={[["#blueprint", "The blueprint"], ["#sam", "Meet Sam"], ["#workspace", "Workspace"], ["#examples", "Examples"]]} />
        <FooterCol title="Company" links={[["/pricing", "Pricing"], ["/developers", "Developers"], ["#faq", "FAQ"], ["/auth", "Sign in"], ["/auth", "Get started"]]} />
        <FooterCol title="Legal" links={[["/privacy", "Privacy"], ["/terms", "Terms"]]} />
      </div>
      <div className="border-t border-[hsl(var(--sidebar-border))]">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-5 py-6 text-[12px] md:px-8">
          <p>© 2026 AutoSocials. All rights reserved.</p>
          <p>Example content on this page is illustrative.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h3 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-inverse">{title}</h3>
      <ul className="mt-4 space-y-2.5 text-[14px]">
        {links.map(([href, label]) => (
          <li key={label}>
            {href.startsWith("/") ? <a href={href} className="hover:text-inverse">{label}</a> : <a href={href} className="hover:text-inverse">{label}</a>}
          </li>
        ))}
      </ul>
    </div>
  );
}
