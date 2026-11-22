import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { checkDesignQuotation } from "@/lib/social-quote.functions";
import type { QuoteEvidence } from "@/lib/social-design";

export function DesignQuotation({
  workspaceId,
  quote,
  onChange,
}: {
  workspaceId: string;
  quote?: QuoteEvidence | undefined;
  onChange: (quote?: QuoteEvidence) => void;
}) {
  const check = useServerFn(checkDesignQuotation);
  const [editing, setEditing] = useState(false);
  const [words, setWords] = useState("");
  const [speaker, setSpeaker] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const open = () => {
    setWords(quote?.text ?? "");
    setSpeaker(quote?.speaker ?? "");
    setUrl(quote?.sourceUrl ?? "");
    setMessage("");
    setEditing(true);
  };
  const apply = async () => {
    setBusy(true);
    setMessage("");
    try {
      const verified = await check({
        data: {
          workspace_id: workspaceId,
          candidate: {
            text: words.trim(),
            speaker: speaker.trim(),
            sourceUrl: url.trim(),
            sourceTitle: quote?.sourceTitle ?? "Primary source",
          },
        },
      });
      if (!verified) {
        setMessage(
          "The wording and speaker could not be verified at that source.",
        );
        return;
      }
      const sameWords =
        words.trim().replace(/\s+/g, " ") ===
        verified.text.replace(/\s+/g, " ");
      onChange({ ...verified, text: sameWords ? words.trim() : verified.text });
      setEditing(false);
    } catch {
      setMessage(
        "Could not check the quotation. Review the source address and try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const field =
    "block w-full rounded-lg border border-border-control bg-surface p-2";
  return (
    <div className="space-y-2 text-sm">
      {quote && (
        <blockquote className="border-l-2 border-border pl-3 whitespace-pre-line">
          {quote.text}
          <footer className="mt-1">
            {quote.speaker} ·{" "}
            <a
              href={quote.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              {quote.sourceTitle}
            </a>
          </footer>
        </blockquote>
      )}
      {editing ? (
        <fieldset disabled={busy} className="space-y-2">
          <label className="block">
            Quotation
            <textarea
              className={field}
              value={words}
              maxLength={300}
              onChange={(e) => setWords(e.target.value)}
            />
          </label>
          <label className="block">
            Speaker or author
            <input
              className={field}
              value={speaker}
              maxLength={100}
              onChange={(e) => setSpeaker(e.target.value)}
            />
          </label>
          <label className="block">
            Primary source URL
            <input
              className={field}
              type="url"
              value={url}
              maxLength={2048}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          {message && <p role="alert">{message}</p>}
          <div className="flex gap-4">
            <button
              type="button"
              className="underline"
              disabled={!words.trim() || !speaker.trim() || !url.trim()}
              onClick={() => void apply()}
            >
              {busy ? "Checking source…" : "Check and apply quote"}
            </button>
            <button
              type="button"
              className="underline"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </fieldset>
      ) : (
        <div className="flex gap-4">
          <button type="button" className="underline" onClick={open}>
            {quote ? "Edit quote" : "Add sourced quote"}
          </button>
          {quote && (
            <button
              type="button"
              className="underline"
              onClick={() => onChange()}
            >
              Remove quote
            </button>
          )}
        </div>
      )}
    </div>
  );
}
