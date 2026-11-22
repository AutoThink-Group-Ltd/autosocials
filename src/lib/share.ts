import type { EmailInput } from "./email-layout.server";

export const SHARE_ORIGIN = "https://autosocials.com";

/** Copy for the "share videos with a colleague" email. Pure so it can be tested. */
export function shareEmailContent(i: { sender: string; brand: string; count: number; note?: string | undefined; url: string }): { subject: string; email: EmailInput } {
  const what = i.count === 1 ? "a new video" : `${i.count} new videos`;
  return {
    subject: `${i.sender} shared ${what} for ${i.brand}`,
    email: {
      preheader: `Watch ${what} made for ${i.brand} on AutoSocials.`,
      heading: `${i.sender} shared ${what}`,
      accent: `for ${i.brand}`,
      intro: [
        ...(i.note?.trim() ? [`“${i.note.trim()}”`] : []),
        `Tap below to watch ${i.count === 1 ? "it" : "them"} in full and download the original file${i.count === 1 ? "" : "s"}. No sign-in needed.`,
      ],
      ctaLabel: i.count === 1 ? "Watch the video" : "Watch the videos",
      ctaUrl: i.url,
      signOff: false,
    },
  };
}

/** Social share targets for a public link. */
export function shareTargets(url: string, text: string) {
  const u = encodeURIComponent(url), t = encodeURIComponent(text);
  return [
    { id: "whatsapp", label: "WhatsApp", href: `https://wa.me/?text=${t}%20${u}` },
    { id: "x", label: "X", href: `https://twitter.com/intent/tweet?text=${t}&url=${u}` },
    { id: "linkedin", label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    { id: "facebook", label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
  ];
}
