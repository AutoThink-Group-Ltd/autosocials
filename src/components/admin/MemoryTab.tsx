import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Brain, FileText, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Eager-load every markdown file under src/memories/ as raw text.
// Vite resolves these at build time so they ship with the app.
const rawMemories = import.meta.glob("/src/memories/**/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

interface ParsedMemory {
  id: string;          // file path
  slug: string;        // mem:// path equivalent
  name: string;
  description: string;
  type: string;
  body: string;
  raw: string;
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  (m[1] ?? "").split("\n").forEach((line) => {
    const i = line.indexOf(":");
    if (i === -1) return;
    meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  });
  return { meta, body: m[2] ?? "" };
}

function pathToSlug(path: string): string {
  // /src/memories/agents__vibe-persona.md -> mem://agents/vibe-persona
  return (
    "mem://" +
    path
      .replace(/^\/src\/memories\//, "")
      .replace(/\.md$/, "")
      .replace(/__/g, "/")
  );
}

const memories: ParsedMemory[] = Object.entries(rawMemories)
  .map(([path, raw]) => {
    const { meta, body } = parseFrontmatter(raw);
    const slug = pathToSlug(path);
    const fallbackName = path.split("/").pop()!.replace(/\.md$/, "").replace(/__/g, " / ");
    return {
      id: path,
      slug,
      name: meta["name"] || fallbackName,
      description: meta["description"] || "",
      type: meta["type"] || "memory",
      body,
      raw,
    };
  })
  .sort((a, b) => {
    // index first, then by type, then name
    if (a.type === "index") return -1;
    if (b.type === "index") return 1;
    return a.name.localeCompare(b.name);
  });

const TYPE_COLORS: Record<string, string> = {
  index: "bg-[hsl(var(--brand-pink)/0.1)] text-[hsl(var(--brand-pink))] border-[hsl(var(--brand-pink)/0.2)]",
  persona: "bg-purple-500/10 text-purple-700 border-purple-500/20",
  design: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  preference: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  feature: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  constraint: "bg-rose-500/10 text-rose-700 border-rose-500/20",
  reference: "bg-cyan-500/10 text-cyan-700 border-cyan-500/20",
  memory: "bg-secondary text-secondary-foreground border-border",
};

export default function MemoryTab() {
  const [activeId, setActiveId] = useState<string>(memories[0]?.id ?? "");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return memories;
    return memories.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.slug.toLowerCase().includes(q),
    );
  }, [search]);

  const active = memories.find((m) => m.id === activeId) ?? filtered[0];

  return (
    <div className="space-y-4">
      {/* Header strip */}
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[hsl(var(--brand-pink))] to-[hsl(var(--brand-purple))]">
          <Brain className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold">System Memory</h2>
          <p className="text-xs text-muted-foreground">
            Live mirror of <code className="font-mono">mem://</code> — rules, persona and context that shape every decision.
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">{memories.length}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">memories loaded</div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Memory list */}
        <div className="col-span-12 lg:col-span-4">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="border-b border-border p-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search memories…"
                  className="h-8 pl-8 text-xs"
                />
              </div>
            </div>
            <div className="max-h-[640px] overflow-y-auto">
              {filtered.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setActiveId(m.id)}
                  className={cn(
                    "block w-full border-b border-border/60 p-3 text-left transition-colors hover:bg-secondary/50",
                    active?.id === m.id && "bg-[hsl(var(--brand-pink)/0.06)]",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate text-sm font-medium text-foreground">{m.name}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span
                      className={cn(
                        "rounded-md border px-1.5 py-0.5 text-[9px] uppercase tracking-wider",
                        TYPE_COLORS[m.type] || TYPE_COLORS["memory"],
                      )}
                    >
                      {m.type}
                    </span>
                    <span className="truncate font-mono text-[10px] text-muted-foreground">{m.slug}</span>
                  </div>
                  {m.description && (
                    <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{m.description}</p>
                  )}
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="p-6 text-center text-xs text-muted-foreground">No memories match.</div>
              )}
            </div>
          </div>
        </div>

        {/* Memory body */}
        <div className="col-span-12 lg:col-span-8">
          {active ? (
            <div className="rounded-xl border border-border bg-card">
              <div className="flex items-start justify-between gap-4 border-b border-border p-4">
                <div>
                  <h3 className="text-lg font-semibold">{active.name}</h3>
                  <p className="font-mono text-xs text-muted-foreground">{active.slug}</p>
                  {active.description && (
                    <p className="mt-2 text-sm text-muted-foreground">{active.description}</p>
                  )}
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-md border px-2 py-1 text-[10px] uppercase tracking-wider",
                    TYPE_COLORS[active.type] || TYPE_COLORS["memory"],
                  )}
                >
                  {active.type}
                </span>
              </div>
              <article className="prose prose-sm max-w-none p-6 prose-headings:font-semibold prose-h1:text-xl prose-h2:text-base prose-h3:text-sm prose-code:rounded prose-code:bg-secondary prose-code:px-1 prose-code:py-0.5 prose-code:text-[12px] prose-code:before:content-none prose-code:after:content-none">
                <ReactMarkdown>{active.body}</ReactMarkdown>
              </article>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border p-12 text-sm text-muted-foreground">
              Select a memory to view it.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
