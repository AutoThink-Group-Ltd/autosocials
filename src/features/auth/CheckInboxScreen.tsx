import { useEffect, useState } from "react";
import { Mail, ExternalLink, RotateCw } from "lucide-react";

type Props = {
  email: string;
  kind: "verify" | "magic";
  onResend: () => Promise<boolean>;
  onBack: () => void;
  backLabel?: string;
};

function inboxFor(email: string): { label: string; url: string } | null {
  const d = email.split("@")[1]?.toLowerCase() ?? "";
  if (/gmail|googlemail/.test(d)) return { label: "Open Gmail", url: "https://mail.google.com/mail/u/0/#inbox" };
  if (/outlook|hotmail|live|msn/.test(d)) return { label: "Open Outlook", url: "https://outlook.live.com/mail/0/inbox" };
  if (/yahoo/.test(d)) return { label: "Open Yahoo Mail", url: "https://mail.yahoo.com" };
  if (/icloud|me\.com|mac\.com/.test(d)) return { label: "Open iCloud Mail", url: "https://www.icloud.com/mail" };
  return null;
}

export function CheckInboxScreen({ email, kind, onResend, onBack, backLabel = "Wrong email? Start again" }: Props) {
  const [cooldown, setCooldown] = useState(60);
  const [sending, setSending] = useState(false);
  const inbox = inboxFor(email);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const resend = async () => {
    setSending(true);
    const ok = await onResend();
    setSending(false);
    if (ok) setCooldown(60);
  };

  return (
    <div className="check-inbox-enter flex flex-col items-center text-center" role="status" aria-live="polite">
      <div className="relative my-4 flex h-28 w-28 items-center justify-center">
        <span className="sam-pulse-ring absolute inset-0 rounded-full" />
        <span className="sam-pulse-ring sam-pulse-delay absolute inset-0 rounded-full" />
        <span className="sam-breathe relative flex h-24 w-24 items-center justify-center rounded-full bg-ink text-inverse shadow-card">
          <Mail className="envelope-bob h-10 w-10" strokeWidth={1.75} />
        </span>
      </div>

      <h2 className="mt-2 font-display text-[26px] font-extrabold tracking-[-0.03em] text-ink">Check your inbox.</h2>
      <p className="mt-2 max-w-[320px] text-[14px] leading-relaxed text-text-secondary">
        {kind === "verify" ? "We've sent a verify link to " : "Your sign-in link is on its way to "}
        <span className="font-semibold text-ink">{email}</span>.
        {kind === "verify" ? " Open it to activate your account." : " Tap it to sign in."}
      </p>

      <div className="mt-6 w-full space-y-3">
        {inbox && (
          <a href={inbox.url} target="_blank" rel="noopener noreferrer"
            className="flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-ink text-[14px] font-semibold text-inverse hover:bg-ink-hover">
            {inbox.label} <ExternalLink className="h-4 w-4" />
          </a>
        )}
        <button type="button" onClick={resend} disabled={cooldown > 0 || sending}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-border-control bg-surface text-[14px] font-semibold text-ink hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-60">
          <RotateCw className={`h-4 w-4 ${sending ? "animate-spin" : ""}`} />
          {cooldown > 0 ? `Resend email in ${cooldown}s` : sending ? "Sending…" : "Resend email"}
        </button>
      </div>

      <p className="mt-5 text-[12px] text-muted-foreground">Can't see it? Check spam or promotions.</p>
      <button type="button" onClick={onBack} className="mt-3 text-[13px] font-semibold text-ink underline underline-offset-4 hover:text-text-secondary">
        {backLabel}
      </button>
    </div>
  );
}
