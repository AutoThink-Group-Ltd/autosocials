import { useState } from "react";
import {
  developerPages,
  developerExamples,
  searchDeveloperPages,
  type DeveloperPage,
} from "./content";

export function DeveloperDocs({ page }: { page?: DeveloperPage }) {
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const matches = searchDeveloperPages(query);
  const copy = async () => {
    const text = page
      ? [
          page.title,
          page.description,
          ...page.sections.flatMap((s) => [s.heading, ...s.paragraphs]),
          ...(page.slug === "reference"
            ? developerExamples.flatMap((e) => [e.language, e.code])
            : []),
        ].join("\n\n")
      : "https://autosocials.com/mcp";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <a href="/" className="text-sm font-semibold">
          AutoSocials
        </a>
        <div className="mt-8 grid gap-10 md:grid-cols-[16rem_1fr]">
          <aside>
            <a href="/developers" className="text-lg font-bold">
              Developer documentation
            </a>
            <label
              htmlFor="docs-search"
              className="mt-6 block text-sm font-medium"
            >
              Search documentation
            </label>
            <input
              id="docs-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search pages"
              className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2"
            />
            <nav aria-label="Developer pages" className="mt-4">
              <ul className="space-y-3">
                {matches.map((item) => (
                  <li key={item.slug}>
                    <a
                      className="text-sm underline"
                      href={`/developers/${item.slug}`}
                    >
                      {item.title}
                    </a>
                  </li>
                ))}
              </ul>
              {matches.length === 0 && (
                <p className="text-sm">No matching pages.</p>
              )}
            </nav>
          </aside>
          <article className="max-w-3xl">
            <p className="text-sm font-semibold">AUTOSOCIALS FOR DEVELOPERS</p>
            <h1 className="mt-3 text-4xl font-bold">
              {page?.title ?? "Build with AutoSocials"}
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              {page?.description ??
                "Guides and references for connecting authorised AI clients to an AutoSocials workspace."}
            </p>
            <button
              type="button"
              onClick={copy}
              className="mt-5 rounded-md border border-input px-4 py-2 text-sm"
            >
              {copied ? "Copied" : page ? "Copy page text" : "Copy MCP URL"}
            </button>
            {page ? (
              <>
                {page.sections.map((section) => (
                  <section key={section.heading} className="mt-10">
                    <h2 className="text-2xl font-semibold">
                      {section.heading}
                    </h2>
                    {section.checklist ? (
                      <ol className="mt-4 list-decimal space-y-3 pl-6 leading-7">
                        {section.paragraphs.map((paragraph) => (
                          <li key={paragraph}>{renderLinks(paragraph)}</li>
                        ))}
                      </ol>
                    ) : (
                      section.paragraphs.map((paragraph) => (
                        <p className="mt-4 leading-7" key={paragraph}>
                          {renderLinks(paragraph)}
                        </p>
                      ))
                    )}
                  </section>
                ))}
                {page.slug === "reference" && (
                  <section className="mt-10">
                    <h2 className="text-2xl font-semibold">
                      Read channels: examples
                    </h2>
                    <p className="mt-3">
                      Use a securely stored workspace key with channels:read.
                      Examples have not been verified against a deployed
                      endpoint.
                    </p>
                    {developerExamples.map((example) => (
                      <div key={example.language} className="mt-5">
                        <h3 className="font-semibold">{example.language}</h3>
                        <pre className="mt-2 overflow-x-auto rounded border border-border p-4">
                          <code>{example.code}</code>
                        </pre>
                        <button
                          type="button"
                          className="mt-2 underline"
                          onClick={() => {
                            void navigator.clipboard
                              .writeText(example.code)
                              .catch(() => {});
                          }}
                        >
                          Copy {example.language}
                        </button>
                      </div>
                    ))}
                  </section>
                )}
              </>
            ) : (
              <div className="mt-10 grid gap-4 sm:grid-cols-2">
                {developerPages.map((item) => (
                  <a
                    key={item.slug}
                    href={`/developers/${item.slug}`}
                    className="rounded-lg border border-border p-5"
                  >
                    <h2 className="font-semibold underline">{item.title}</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {item.description}
                    </p>
                  </a>
                ))}
              </div>
            )}
            <p className="mt-12 text-sm">
              <a className="underline" href="/llms-full.txt">
                Full text index
              </a>{" "}
              ·{" "}
              <a className="underline" href="/openapi.json">
                OpenAPI
              </a>{" "}
              ·{" "}
              <a className="underline" href="/pricing">
                Pricing
              </a>
            </p>
          </article>
        </div>
      </div>
    </main>
  );
}

function renderLinks(text: string) {
  return text.split(/(https:\/\/[^\s]+?)(?=[.,;]?\s|$)/g).map((part, index) =>
    part.startsWith("https://") ? (
      <a key={`${index}-${part}`} href={part} className="underline">
        {part}
      </a>
    ) : (
      part
    ),
  );
}
