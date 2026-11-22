import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Children, isValidElement, type ReactNode } from "react";

const slug = (n: ReactNode): string => {
  const text = Children.toArray(n).map((c) => (typeof c === "string" ? c : isValidElement(c) ? slug((c.props as { children?: ReactNode }).children) : "")).join("");
  return text.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");
};
const HEX = /#(?:[0-9a-f]{3}){1,2}\b/gi;

/** Inline hex codes become real colour chips. */
function withSwatches(children: ReactNode): ReactNode {
  return Children.map(children, (c) => {
    if (typeof c !== "string" || !HEX.test(c)) return c;
    HEX.lastIndex = 0;
    const parts: ReactNode[] = []; let last = 0;
    for (const m of c.matchAll(HEX)) {
      parts.push(c.slice(last, m.index));
      parts.push(<span key={m.index} className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-1.5 align-baseline font-mono text-[0.85em]"><span className="inline-block h-3 w-3 rounded-sm border border-border" style={{ background: m[0] }} />{m[0]}</span>);
      last = (m.index ?? 0) + m[0].length;
    }
    parts.push(c.slice(last));
    return parts;
  });
}

export function headingsOf(md: string) {
  return md.split("\n").map((l) => /^(#{1,3})\s+(.+)/.exec(l)).filter(Boolean).map((m) => ({ depth: m![1]!.length, text: m![2]!.replace(/[*_`]/g, "") }));
}

/** Editorial-grade markdown: Sam's briefs, scripts, brand guides and your notes. */
export function Markdown({ source }: { source: string }) {
  return (
    <div className="studio-doc text-[15px] leading-[1.75] text-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
        h1: ({ children }) => <h1 id={slug(children)} className="mb-4 mt-8 scroll-mt-20 font-display text-[30px] font-bold leading-tight tracking-tight first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 id={slug(children)} className="mb-3 mt-8 scroll-mt-20 border-b border-border pb-2 font-display text-[22px] font-bold tracking-tight">{children}</h2>,
        h3: ({ children }) => <h3 id={slug(children)} className="mb-2 mt-6 scroll-mt-20 font-display text-[17px] font-bold">{children}</h3>,
        p: ({ children }) => <p className="my-3">{withSwatches(children)}</p>,
        li: ({ children }) => <li className="my-1 pl-1">{withSwatches(children)}</li>,
        ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-6 marker:text-muted-foreground">{children}</ul>,
        ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-6 marker:text-muted-foreground">{children}</ol>,
        blockquote: ({ children }) => <blockquote className="my-5 border-l-4 border-ink bg-surface-subtle py-2 pl-5 pr-3 font-display text-[17px] italic">{children}</blockquote>,
        a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="font-medium underline decoration-border-control underline-offset-4 hover:decoration-ink">{children}</a>,
        hr: () => <hr className="my-8 border-border" />,
        code: ({ children, className }) => className
          ? <code className={`${className} block`}>{children}</code>
          : <code className="rounded-md bg-surface-subtle px-1.5 py-0.5 font-mono text-[0.88em]">{children}</code>,
        pre: ({ children }) => <pre className="my-4 overflow-x-auto rounded-[12px] bg-ink p-4 font-mono text-[13px] leading-relaxed text-inverse">{children}</pre>,
        table: ({ children }) => <div className="my-5 overflow-x-auto rounded-[12px] border border-border"><table className="w-full text-left text-[14px]">{children}</table></div>,
        thead: ({ children }) => <thead className="bg-surface-subtle">{children}</thead>,
        th: ({ children }) => <th className="border-b border-border px-3 py-2 font-semibold">{children}</th>,
        td: ({ children }) => <td className="border-b border-border px-3 py-2 align-top">{withSwatches(children)}</td>,
        img: ({ src, alt }) => <img src={typeof src === "string" ? src : undefined} alt={alt ?? ""} className="my-4 rounded-[12px] border border-border" loading="lazy" />,
        input: (props) => <input {...props} disabled className="mr-2 accent-[hsl(var(--ink))]" />,
      }}>{source}</ReactMarkdown>
    </div>
  );
}

export const slugify = (s: string) => s.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");
