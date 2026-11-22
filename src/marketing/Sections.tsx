import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, Hand, ShieldCheck, Zap, Link2, BookOpen, Clapperboard } from "lucide-react";
import samPortrait from "@/assets/sam-portrait.jpg";
import t1 from "@/assets/home/tile-1.jpg";
import t3 from "@/assets/home/tile-3.jpg";
import t4 from "@/assets/home/tile-4.jpg";
import t5 from "@/assets/home/tile-5.jpg";
import { MODULES } from "@/brand/tokens";

const H2 = "font-display font-extrabold leading-[1.02] tracking-[-0.05em] text-ink";
const EYEBROW = "text-[12px] font-medium uppercase tracking-[0.2em] text-text-secondary";

/* ---------------- Meet Sam ---------------- */
const MODES = [
  { Icon: Hand, title: "Manual", body: "Sam prepares the work. You press every button." },
  { Icon: ShieldCheck, title: "Approve", body: "Sam queues each action and waits for your yes." },
  { Icon: Zap, title: "Ask", body: "Ask Sam anything about your brand, content or results and get a straight answer." },
];

export function MeetSam() {
  return (
    <section id="sam" className="bg-ink text-inverse">
      <div className="mx-auto grid max-w-[1240px] items-center gap-12 px-5 py-24 md:grid-cols-[0.9fr_1.1fr] md:px-8">
        <div className="relative mx-auto w-full max-w-[420px]">
          <img src={samPortrait} alt="Sam, AutoSocials' AI agent" loading="lazy" width={640} height={640} className="aspect-square w-full rounded-[20px] object-cover" />
          <div className="absolute -bottom-6 left-6 right-6 rounded-[14px] bg-canvas p-4 text-ink shadow-[var(--shadow-card)]">
            <p className="text-[12px] text-text-secondary">Sam · just now</p>
            <p className="mt-1 text-[14px] leading-snug">Batch 03 is scheduled. Two hooks are pulling ahead — I'll hold them for a paid test once they've had 72 hours.</p>
          </div>
        </div>
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-silver">Meet Sam</p>
          <h2 className={`${H2} mt-3 text-inverse`} style={{ fontSize: "clamp(36px, 5vw, 60px)" }}>Your AI social growth agent.</h2>
          <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-silver">
            Sam is an AI agent, not a person. She learns your business from your brand dossier, then operates the whole cycle: briefs, videos, schedules, shortlists, paid tests and findings. She narrates briefly and puts the real work on screen.
          </p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-3">
            {MODES.map(({ Icon, title, body }) => (
              <li key={title} className="rounded-[14px] border border-[hsl(var(--sidebar-border))] p-4">
                <Icon className="h-5 w-5" aria-hidden />
                <p className="mt-3 font-display text-[17px] font-bold">{title}</p>
                <p className="mt-1 text-[13px] leading-snug text-silver">{body}</p>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-[13px] text-silver">Sam never spends, posts or deletes outside the authority you've given her.</p>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Workspace preview ---------------- */
export function WorkspacePreview() {
  return (
    <section id="workspace" className="mx-auto max-w-[1240px] px-5 py-24 md:px-8">
      <div className="max-w-2xl">
        <p className={EYEBROW}>The workspace</p>
        <h2 className={`${H2} mt-3`} style={{ fontSize: "clamp(36px, 5vw, 60px)" }}>The blueprint, Sam and the work. Side by side.</h2>
        <p className="mt-4 text-[17px] text-text-secondary">Five stages on the left. Sam in the middle. Live work on the right — real videos, queues and campaigns, never walls of chat.</p>
      </div>

      <div className="mt-12 overflow-hidden rounded-[18px] border border-border shadow-[var(--shadow-card)]" aria-label="Illustration of the AutoSocials workspace" role="img">
        <div className="grid min-h-[460px] grid-cols-[96px_minmax(0,1fr)] sm:grid-cols-[140px_minmax(0,1fr)] md:grid-cols-[190px_280px_minmax(0,1fr)]">
          <div className="min-w-0 bg-ink p-2 text-[11px] text-silver sm:p-3">
            <p className="mb-4 font-display text-[15px] font-extrabold text-inverse">S AutoSocials</p>
            <p className="mb-3 rounded-[8px] bg-canvas py-1.5 text-center font-semibold text-ink">+ New batch</p>
            {MODULES.map((m, i) => (
              <p key={m.id} className={`mb-1 flex gap-2 rounded-[8px] px-2 py-1.5 ${i === 0 ? "bg-canvas text-ink" : "text-inverse/85"}`}>
                <span className="opacity-60">{m.number}</span>{m.label}
              </p>
            ))}
            <p className="mt-5 uppercase tracking-wider">Current cycle</p>
            <p className="mt-1 text-inverse/85">Acme · October launch</p>
          </div>
          <div className="hidden flex-col border-r border-border bg-canvas p-3 text-[12px] md:flex">
            <div className="mb-3 flex items-center gap-2">
              <img src={samPortrait} alt="" className="h-7 w-7 rounded-full object-cover" loading="lazy" />
              <p className="font-display font-bold">Sam</p>
            </div>
            <p className="ml-auto max-w-[85%] rounded-[12px] bg-ink px-3 py-2 text-inverse">Make my first batch for the October launch.</p>
            <p className="mt-2 max-w-[90%] rounded-[12px] border border-border bg-surface px-3 py-2">Done — 3 angles, 4 hooks each. Two are rendering now. Pick your favourites on the right.</p>
            <div className="mt-auto rounded-[12px] border border-border-control bg-surface p-2 text-text-secondary">
              <p className="mb-1 text-[10px]">Acme / Batch 01 / 2 selected</p>Ask Sam…
            </div>
          </div>
          <div className="min-w-0 bg-surface p-2 sm:p-3">
            <div className="mb-3 flex flex-wrap gap-1 text-[11px]">
              <span className="rounded-[8px] bg-ink px-2.5 py-1 text-inverse">Current batch</span>
              <span className="rounded-[8px] px-2.5 py-1 text-text-secondary">Hook matrix</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[t4, t1, t3, t5].map((src, i) => (
                <div key={i} className={`relative aspect-[9/14] overflow-hidden rounded-[10px] ${i === 0 ? "ring-2 ring-ink" : ""}`}>
                  <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
                  <span className="absolute bottom-1.5 left-1.5 rounded-full bg-surface px-1.5 py-0.5 text-[9px] font-semibold">{i < 2 ? "Selected" : "Rendering"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-[12px] text-text-secondary">Illustrative workspace.</p>
    </section>
  );
}

/* ---------------- First session ---------------- */
const STEPS = [
  { Icon: Link2, title: "Connect your accounts", body: "Link the social accounts Sam should publish to. Nothing posts without your authority." },
  { Icon: BookOpen, title: "Teach Sam your business", body: "Paste or upload your brand dossier — offer, audience, claims you can make, tone." },
  { Icon: Clapperboard, title: "Get your first batch", body: "Sam proposes angles and hooks. You pick what to make, then what to publish." },
];

export function FirstSession() {
  return (
    <section className="border-y border-border bg-surface">
      <div className="mx-auto max-w-[1240px] px-5 py-24 md:px-8">
        <p className={EYEBROW}>Your first session</p>
        <h2 className={`${H2} mt-3`} style={{ fontSize: "clamp(32px, 4.2vw, 52px)" }}>Ten minutes to your first batch.</h2>
        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {STEPS.map(({ Icon, title, body }, i) => (
            <li key={title} className="rounded-[16px] border border-border bg-canvas p-6">
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-inverse"><Icon className="h-4 w-4" aria-hidden /></span>
                <span className="font-display text-[28px] font-extrabold text-silver">0{i + 1}</span>
              </div>
              <h3 className="mt-5 font-display text-[20px] font-bold tracking-[-0.02em]">{title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-text-secondary">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------------- Principles ---------------- */
const PRINCIPLES = [
  "Real videos, real queues, real campaigns — never a chat transcript pretending to be work.",
  "Winners are picked from your own results, with the evidence shown.",
  "Missing data stays missing. Sam doesn't guess numbers.",
  "Every spend, post and deletion respects the limits you set.",
];

export function Principles() {
  return (
    <section className="mx-auto max-w-[1240px] px-5 py-24 md:px-8">
      <div className="grid gap-10 md:grid-cols-2">
        <div>
          <p className={EYEBROW}>How Sam works</p>
          <h2 className={`${H2} mt-3`} style={{ fontSize: "clamp(32px, 4.2vw, 52px)" }}>Honest by design.</h2>
        </div>
        <ul className="space-y-4">
          {PRINCIPLES.map((p) => (
            <li key={p} className="flex gap-3 text-[17px] leading-relaxed">
              <Check className="mt-1 h-5 w-5 shrink-0" aria-hidden /> {p}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------------- FAQ ---------------- */
const FAQ = [
  ["Is Sam a real person?", "No. Sam is an AI agent. She's clear about that in every conversation."],
  ["Will Sam post without asking?", "No. Every post and spend waits for your approval."],
  ["Which platforms are supported?", "Publishing works with connected Facebook, Instagram and TikTok accounts. Paid tests are on the way, starting with Meta."],
  ["Where does Sam learn about my business?", "From your brand dossier — the documents you paste or upload. It's the main source of truth for everything she makes."],
  ["Can I edit what Sam makes?", "Yes. You and Sam work on the same saved objects, and your edits are never overwritten."],
];

export function Faq() {
  return (
    <section id="faq" className="border-t border-border">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-5 py-24 md:grid-cols-[0.8fr_1.2fr] md:px-8">
        <h2 className={H2} style={{ fontSize: "clamp(32px, 4.2vw, 52px)" }}>Questions, answered.</h2>
        <div className="divide-y divide-border border-y border-border">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between font-display text-[18px] font-bold">
                {q}<span className="ml-4 text-text-secondary transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-text-secondary">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- Final CTA ---------------- */
export function FinalCta() {
  return (
    <section className="mx-auto max-w-[1240px] px-5 pb-24 md:px-8">
      <div className="rounded-[24px] bg-surface-subtle px-6 py-16 text-center md:py-20">
        <h2 className={H2} style={{ fontSize: "clamp(36px, 5.6vw, 72px)" }}>
          Start the cycle.<br /><em className="font-editorial font-normal" style={{ fontStyle: "italic" }}>Keep it going.</em>
        </h2>
        <p className="mx-auto mt-5 max-w-md text-[17px] text-text-secondary">Connect an account, share your dossier and let Sam plan your first batch.</p>
        <Link to="/auth" className="mt-8 inline-flex h-12 items-center gap-2 rounded-[10px] bg-ink px-6 text-[15px] font-semibold text-inverse hover:bg-ink-hover">
          Put Sam to work <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
