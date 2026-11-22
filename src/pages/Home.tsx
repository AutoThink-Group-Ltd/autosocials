import { Link } from "@tanstack/react-router";
import { ArrowRight, ArrowLeft, Play, Star, CalendarClock, Plus, Instagram, Youtube, Linkedin, Music2, Twitter } from "lucide-react";
import { PublicNav } from "@/marketing/PublicNav";
import { PublicFooter } from "@/marketing/PublicFooter";
import { MeetSam, WorkspacePreview, FirstSession, Principles, Faq, FinalCta } from "@/marketing/Sections";
import samPortrait from "@/assets/sam-portrait.jpg";
import t1 from "@/assets/home/tile-1.jpg";
import t2 from "@/assets/home/tile-2.jpg";
import t3 from "@/assets/home/tile-3.jpg";
import t4 from "@/assets/home/tile-4.jpg";
import t5 from "@/assets/home/tile-5.jpg";

const TILES = [
  { src: t1, caption: "I built this to save time.", time: "0:28", alt: "Founder talking to camera about saving time" },
  { src: t2, caption: "One app. Less admin.", time: "0:32", alt: "Phone showing the AutoSocials cycle checklist" },
  { src: t3, caption: "More customers without the busywork.", time: "0:41", alt: "Creator explaining an app to camera" },
  { src: t4, caption: "Turn your content into customers.", time: "0:29", alt: "Creator reaching towards camera", selected: true },
  { src: t5, caption: "A simpler way to grow your app.", time: "0:26", alt: "Creator talking beside a laptop", scheduled: true },
];

function Tile({ t, eager }: { t: (typeof TILES)[number]; eager?: boolean }) {
  return (
    <figure
      className={`relative aspect-[9/14] w-[68vw] shrink-0 snap-start overflow-hidden rounded-[14px] sm:w-[40vw] md:w-auto ${
        t.selected ? "ring-[3px] ring-ink" : ""
      }`}
    >
      <img src={t.src} alt={t.alt} width={720} height={1280} loading={eager ? "eager" : "lazy"} className="h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink/75 via-ink/0 to-ink/0" />
      {t.selected && (
        <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink">
          <Star className="h-3 w-3 fill-current" aria-hidden /> Selected by Sam
        </span>
      )}
      {t.scheduled && (
        <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-md bg-surface px-2 py-1 text-[11px] font-semibold text-ink">
          <CalendarClock className="h-3 w-3" aria-hidden /> Scheduled
        </span>
      )}
      <figcaption className="absolute inset-x-3 bottom-3 text-inverse">
        <p className="font-display text-[19px] font-extrabold leading-[1.05] tracking-[-0.02em] lg:text-[22px]">{t.caption}</p>
        <p className="mt-2 inline-flex items-center gap-1.5 text-[12px]"><Play className="h-3 w-3 fill-current" aria-hidden /> {t.time}</p>
      </figcaption>
    </figure>
  );
}

function Stack({ imgs, plus }: { imgs: string[]; plus?: "left" | "right" }) {
  return (
    <div className="relative mx-auto h-[150px] w-[180px]">
      {imgs.slice(1).reverse().map((s, i) => (
        <img key={i} src={s} alt="" aria-hidden loading="lazy" width={720} height={1280}
          className="absolute top-3 h-[118px] w-[72px] rounded-md object-cover shadow-[var(--shadow-card)]"
          style={{ left: 80 + (imgs.length - 2 - i) * 26, transform: `rotate(${4 + i * 2}deg)` }} />
      ))}
      <img src={imgs[0]} alt="" aria-hidden loading="lazy" width={720} height={1280}
        className="absolute left-2 top-0 h-[140px] w-[92px] -rotate-3 rounded-md border-2 border-surface object-cover shadow-[var(--shadow-card)]" />
      {plus && (
        <span className={`absolute bottom-1 ${plus === "left" ? "left-0" : "right-0"} flex h-8 w-8 items-center justify-center rounded-full bg-surface shadow-[var(--shadow-card)]`}>
          <Plus className="h-4 w-4" aria-hidden />
        </span>
      )}
    </div>
  );
}

const SCHEDULE = [
  { Icon: Instagram, day: "Mon", time: "9:00 AM" },
  { Icon: Music2, day: "Mon", time: "12:00 PM" },
  { Icon: Youtube, day: "Tue", time: "9:00 AM" },
  { Icon: Linkedin, day: "Tue", time: "12:00 PM" },
  { Icon: Twitter, day: "Wed", time: "9:00 AM" },
];

const STAGES = [
  { n: "01", title: "Batch create", body: "Fresh hooks and video variations." },
  { n: "02", title: "Publish", body: "Scheduled across your channels." },
  { n: "03", title: "Find winners", body: "Selected from organic performance." },
  { n: "04", title: "Launch ads", body: "Campaigns built around the winners." },
  { n: "05", title: "Learn & repeat", body: "Results shape your next batch." },
];

function StageVisual({ i }: { i: number }) {
  if (i === 0) return <Stack imgs={[t4, t3, t5]} plus="left" />;
  if (i === 1)
    return (
      <ul className="mx-auto w-[170px] space-y-2 rounded-[12px] bg-surface p-3 shadow-[var(--shadow-card)]">
        {SCHEDULE.map(({ Icon, day, time }, k) => (
          <li key={k} className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Icon className="h-3.5 w-3.5 text-ink" aria-hidden />
            <span className="w-7">{day}</span><span className="flex-1 tabular-nums">{time}</span>
            <span className="relative h-3.5 w-6 rounded-full bg-ink"><span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-surface" /></span>
          </li>
        ))}
      </ul>
    );
  if (i === 2)
    return (
      <div className="relative mx-auto h-[150px] w-[170px]">
        <img src={t5} alt="" aria-hidden loading="lazy" className="absolute right-0 top-3 h-[118px] w-[50px] rounded-md object-cover opacity-80" />
        <img src={t1} alt="" aria-hidden loading="lazy" className="absolute right-8 top-2 h-[124px] w-[56px] rounded-md object-cover" />
        <div className="absolute left-0 top-0 h-[146px] w-[96px] overflow-hidden rounded-md ring-2 ring-ink">
          <img src={t4} alt="" aria-hidden loading="lazy" className="h-full w-full object-cover" />
          <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-surface px-1.5 py-0.5 text-[9px] font-semibold"><Star className="h-2.5 w-2.5 fill-current" aria-hidden /> Selected by Sam</span>
        </div>
      </div>
    );
  if (i === 3)
    return (
      <div className="mx-auto w-[150px] rounded-[10px] bg-surface p-2 shadow-[var(--shadow-card)]">
        <p className="mb-1 text-[9px] text-muted-foreground">Sponsored</p>
        <div className="relative overflow-hidden rounded-md">
          <img src={t4} alt="" aria-hidden loading="lazy" className="h-[100px] w-full object-cover" />
          <p className="absolute inset-x-1.5 bottom-1.5 font-display text-[11px] font-extrabold leading-tight text-inverse">Turn your content into customers.</p>
        </div>
        <span className="mt-1.5 flex h-6 items-center justify-center gap-1 rounded bg-ink text-[10px] font-semibold text-inverse">Learn more <ArrowRight className="h-3 w-3" aria-hidden /></span>
      </div>
    );
  return <Stack imgs={[t4, t3, t1]} plus="right" />;
}

export default function Home() {
  return (
    <div className="min-h-screen bg-canvas text-foreground">
      <PublicNav />

      <main>
        <section className="relative mx-auto max-w-[1240px] px-5 pt-6 text-center md:px-8 md:pt-8">
          <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-text-secondary">Your AI social growth agent</p>
          <h1 className="mx-auto mt-4 font-display font-extrabold leading-[0.98] tracking-[-0.055em] text-ink" style={{ fontSize: "clamp(46px, 7.4vw, 108px)" }}>
            Organic content.<br />Paid growth.<br />
            <em className="font-editorial font-normal not-italic tracking-[-0.02em]" style={{ fontStyle: "italic" }}>On repeat.</em>
          </h1>
          <p className="mx-auto mt-6 max-w-[600px] text-[17px] leading-relaxed text-text-secondary md:text-[19px]">
            Sam creates and schedules your videos, finds the winners and turns them into paid campaigns. Then she does it again.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-5">
            <Link to="/auth" className="inline-flex h-12 items-center gap-2 rounded-[10px] bg-ink px-6 text-[15px] font-semibold text-inverse hover:bg-ink-hover">
              Put Sam to work <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <a href="#blueprint" className="inline-flex items-center gap-3 text-[15px] font-semibold text-ink">
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border-control"><Play className="h-3.5 w-3.5 fill-current" aria-hidden /></span>
              See the cycle
            </a>
          </div>
          <svg aria-hidden className="pointer-events-none absolute right-6 top-24 hidden h-[220px] w-[200px] text-silver xl:block" viewBox="0 0 200 220" fill="none">
            <path d="M110 10c70 10 90 90 30 140-20 18-60 30-100 34" stroke="currentColor" strokeWidth="1.5" />
            <path d="M52 172l-14 12 18 6" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </section>

        <section id="examples" aria-label="Example videos" className="relative mx-auto mt-10 max-w-[1240px] md:px-8">
          <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto px-5 pb-2 scrollbar-hide md:grid md:grid-cols-5 md:overflow-visible md:px-0">
            {TILES.map((t, i) => <Tile key={i} t={t} eager={i < 3} />)}
          </div>
          <div className="mt-3 flex flex-col gap-3 px-5 md:flex-row md:items-start md:justify-between md:px-0">
            <p className="text-[12px] text-muted-foreground">Illustrative content and workflow</p>
            <div className="relative z-10 flex items-center gap-3 self-end rounded-[14px] bg-surface px-3 py-2.5 shadow-[var(--shadow-elevated)] md:-mt-10 md:mr-0">
              <img src={samPortrait} alt="Sam, AI agent" width={40} height={40} loading="lazy" className="h-10 w-10 rounded-full object-cover" />
              <div className="text-left">
                <p className="text-[13px] font-semibold">Sam</p>
                <p className="text-[13px] text-text-secondary">Your strongest videos are ready for a paid test.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="blueprint" className="mx-auto max-w-[1240px] px-5 pb-24 pt-12 md:px-8">
          <div className="border-t border-border pt-10">
            <h2 className="font-display font-extrabold leading-[1.02] tracking-[-0.05em] text-ink" style={{ fontSize: "clamp(36px, 5vw, 60px)" }}>
              One cycle. Sam runs it.
            </h2>
            <p className="mt-1 text-[22px] text-text-secondary md:text-[26px]">Every round informs the next.</p>
          </div>

          <ol className="mt-10 grid gap-10 md:grid-cols-5 md:gap-4">
            {STAGES.map((s, i) => (
              <li key={s.n} className="relative">
                <p className="font-display text-[18px] font-bold">{s.n}</p>
                <h3 className="font-display text-[21px] font-bold tracking-[-0.02em]">{s.title}</h3>
                <p className="mt-1 max-w-[180px] text-[14px] text-text-secondary">{s.body}</p>
                <div className="mt-5 flex h-[160px] items-center"><StageVisual i={i} /></div>
                {i < 4 && <ArrowRight aria-hidden className="absolute -right-4 top-[150px] hidden h-5 w-5 text-text-secondary md:block" strokeWidth={1.25} />}
              </li>
            ))}
          </ol>

          <div className="relative mt-6 hidden md:block" aria-hidden>
            <svg className="h-[70px] w-full text-silver" viewBox="0 0 1000 70" preserveAspectRatio="none" fill="none">
              <path d="M940 0c0 40-20 52-60 52H560 M440 52H120C80 52 70 40 70 8" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <ArrowLeft className="absolute left-[47%] top-[42px] h-4 w-4 text-silver" />
          </div>
          <div className="mt-6 flex items-center justify-center gap-3 md:-mt-[62px]">
            <img src={samPortrait} alt="Sam, AI agent" width={72} height={72} loading="lazy" className="h-[72px] w-[72px] rounded-full border-4 border-canvas object-cover shadow-[var(--shadow-card)]" />
            <p className="text-[14px] leading-snug text-ink">Sam keeps the cycle going<br />so you can keep growing.</p>
          </div>

          <div className="mt-16 flex justify-center">
            <Link to="/auth" className="inline-flex h-12 items-center gap-2 rounded-[10px] bg-ink px-6 text-[15px] font-semibold text-inverse hover:bg-ink-hover">
              Put Sam to work <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </section>
        <MeetSam />
        <WorkspacePreview />
        <FirstSession />
        <Principles />
        <Faq />
        <FinalCta />
      </main>

      <PublicFooter />
    </div>
  );
}
