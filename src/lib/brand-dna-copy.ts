import type { BrandDna, DnaStatement, DnaTileKind } from "./brand-dna";

type Line = {
  text: string;
  source: string;
  status: DnaStatement["evidence"]["status"];
};
const internal =
  /\b(?:source code|canonical|documented|source file|internal brief|reference package|repository|evidence|example brief|campaign registry|sector copy|homepage leads|use the motif|circular endpoint|admin homepage|site owner)\b|^(?:the (?:kit|studio) presents|user can |https?:|#)/i;
const interfaceCopy =
  /(?:cookie|javascript|privacy policy|terms (?:of|and)|basket|checkout|payment (?:provider|gateway|method)|points? at checkout|opening hours|monday.{0,40}(?:friday|thursday)|shopping cart|sign in|log in|stock status|product is unavailable|currently unavailable|different combination|required fields|your browser|accept all|skip to (?:content|navigation)|sorry,|what our customers say|share this|click here|related products)/i;
const unverifiedClaim =
  /\b(?:leading|ultimate|unrivalled|largest|biggest|guarantee(?:d)?|always|never|best[ -]selling|no[.]? ?1|most (?:comprehensive|robust)|life[ -]changing|24[ -]?(?:hours?|hrs?)|out.of.hours|free)\b|24\s*\/\s*7|100\s*%|change your life|enhance your confidence/i;
const dependentFragment =
  /^(?:that['’]s because|all of which|well|so|we have since|as mentioned|this is why)\b/i;
const outcomeClaim =
  /\bsuccess rate\b|\bin just \w+ (?:days|weeks|months)\b|\b(?:will|won['’]t) (?:change|make|cure|prevent)\b/i;
const cta =
  /^(?:book (?:now|an appointment)|request a callback|contact (?:us|your local depot)|learn more|click |shop now|sign up|read more|add to)/i;
const truncated =
  /(?:\.{3}|…|\b(?:an?|the|and|or|for|with|from|to|your|our|its|of|in))$/i;
const shortFragments =
  /^(?:home|about us|why choose us|gallery|contact us|our services|our best selling products|our top categories|top brands|products|what happens next|our team)[?.!]?$/i;

function clean(raw: string) {
  return raw
    .replace(
      /&(?:amp|quot|apos|lt|gt|nbsp|ndash|mdash|rsquo|lsquo|rdquo|ldquo|#\d+|#x[\da-f]+);/gi,
      (entity) => {
        const code = entity.slice(1, -1).toLowerCase();
        if (code.startsWith("#")) {
          const n =
            code[1] === "x"
              ? parseInt(code.slice(2), 16)
              : Number(code.slice(1));
          return n >= 32 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)
            ? String.fromCodePoint(n)
            : " ";
        }
        return (
          (
            {
              amp: "&",
              quot: '"',
              apos: "'",
              lt: "<",
              gt: ">",
              nbsp: " ",
              ndash: "–",
              mdash: "—",
              rsquo: "’",
              lsquo: "‘",
              rdquo: "”",
              ldquo: "“",
            } as Record<string, string>
          )[code] ?? " "
        );
      },
    )
    .replace(/\s+([.,!?])/g, "$1")
    .replace(/\s&(?=[A-Z][a-z])/g, " & ")
    .replace(/\s+/g, " ")
    .trim();
}
const abbreviations = /\b(?:St|Mr|Mrs|Ms|Dr|Ltd|Co|No|approx|e\.g|i\.e)\./gi;
function lines(rows: DnaStatement[], keepHeadings: boolean): Line[] {
  return rows.flatMap(({ text, evidence }) => {
    if (!["observed", "confirmed", "corrected"].includes(evidence.status))
      return [];
    const whole = clean(text).replace(/^(.+[.!?])\s+\1$/i, "$1");
    const fragments =
      keepHeadings && whole.length <= 110
        ? [whole]
        : whole
            .replace(abbreviations, (v) => v.replaceAll(".", "\u2024"))
            .split(/(?<=[.!?])\s+(?=[\p{Lu}\d“"])/u)
            .map((v) => v.replaceAll("\u2024", "."));
    return fragments
      .map((t) => ({
        text: t.trim(),
        source: evidence.source,
        status: evidence.status,
      }))
      .filter(
        ({ text: t, status }) =>
          t.length >= 9 &&
          t.length <= 158 &&
          t.split(/\s+/).length >= 2 &&
          !internal.test(t) &&
          !interfaceCopy.test(t) &&
          !shortFragments.test(t) &&
          !truncated.test(t) &&
          !dependentFragment.test(t) &&
          !/^(?:\d|[A-Z]{1,2}\d{1,2}\s)/.test(t) &&
          !/\b[A-Z]{1,2}\d[A-Z0-9]?\s*\d[A-Z]{2}\b/.test(t) &&
          !(t.length > 110 && !/[.!?]$/.test(t)) &&
          (status === "confirmed" ||
            status === "corrected" ||
            (!unverifiedClaim.test(t) && !outcomeClaim.test(t))),
      );
  });
}
function best(
  candidates: Line[],
  avoid: Set<string>,
  score: (row: Line) => number,
) {
  return candidates
    .filter((c) => !avoid.has(c.text))
    .map((c) => ({ c, score: score(c) }))
    .sort((a, b) => b.score - a.score)[0]?.c;
}
const educational =
  /\b(?:how (?:to|does|do|can|it|we)|what (?:is|are|can|do|to|should)|which |when (?:to|you|choosing)|before |used for|depends on|helps? (?:to|you)|means that|steps? (?:to|from)|check |choose |select |review |set the |tell us |trace the |keeps? |planning|guide)\b/i;
const lessonHeadline = /^(?:how\b|what\b|which\b|when\b)|\bhow to\b|\?$/i;
const benefit =
  /\b(?:help(?:s)? you|your (?:business|idea|campaign|service|customers)|make|discover|designed for|since \d{4}|turn(?:s)? .* into|know which|bring .* to|grow|delivered|thoughtfully|support|try .* before)\b/i;
const service =
  /\b(?:services?|repairs?|supplies|design|produce|install|provide|deliver|print|appointments?|storage|shipping|collections?|planning|manufactur\w+|planning|made|products?|offers?|specialis[et]\w*)\b/i;

export function showcaseCopy(dna: BrandDna, kind: DnaTileKind) {
  const titleKey = clean(dna.name).toLowerCase();
  const h = lines(dna.messages, true),
    prose = lines(dna.examples, false),
    offers = lines(dna.offerings, false);
  const intro = lines(
    [
      {
        text: dna.description,
        evidence: {
          status: "observed",
          confidence: "medium",
          source: dna.website,
        },
      },
    ],
    false,
  );
  const candidates = [
    ...new Map(
      [...h, ...prose, ...intro, ...offers].map((x) => [x.text, x]),
    ).values(),
  ].filter((x) => x.text.toLowerCase() !== titleKey);
  const avoid = new Set<string>();
  const headlines = candidates.filter(
    (x) => x.text.length <= 78 && x.text.split(/\s+/).length <= 12,
  );
  const score = (x: Line) =>
    (cta.test(x.text) ? -10 : 0) +
    (x.text.length <= 100 ? 2 : 0) +
    (x.text.length >= 16 ? 1 : 0) -
    (x.text.includes(";") ? 2 : 0) -
    (/^(?:established|founded) in \d{4}[.]?$/i.test(x.text) ? 8 : 0);
  const product = best(
    headlines,
    avoid,
    (x) =>
      score(x) +
      (intro.some((v) => v.text === x.text) ? 2 : 0) +
      (service.test(x.text) ? 4 : 0) +
      (offers.some((v) => v.text === x.text) ? 1 : 0) -
      (/[?]$/.test(x.text) ? 4 : 0),
  );
  if (product) avoid.add(product.text);
  const lesson = best(
    headlines.filter((x) => educational.test(x.text) && !cta.test(x.text)),
    avoid,
    (x) =>
      score(x) +
      (lessonHeadline.test(x.text) ? 7 : 0) +
      (prose.some((v) => v.text === x.text) ? 2 : 0),
  );
  if (lesson) avoid.add(lesson.text);
  const promo = best(
    headlines,
    avoid,
    (x) =>
      score(x) +
      (benefit.test(x.text) ? 6 : 0) -
      (lessonHeadline.test(x.text) ? 7 : 0) +
      (h.some((v) => v.text === x.text) ? 2 : 0),
  );
  const chosen =
    kind === "product" ? product : kind === "promotional" ? promo : lesson;
  const headline =
    chosen?.text ??
    (kind === "educational" ? "What does " + dna.name + " offer?" : dna.name);
  const limitation =
    !chosen || (kind === "educational" && !educational.test(headline))
      ? "The website supplied limited explanatory copy for this example. Review its wording before sharing."
      : undefined;
  const excluded = new Set(
    candidates
      .filter((x) => headline.includes(x.text) || x.text.includes(headline))
      .map((x) => x.text),
  );
  const genericWords = new Set([
    "also",
    "that",
    "them",
    "they",
    "this",
    "through",
    "when",
    "which",
    "will",
    "with",
    "your",
    "have",
    "need",
    "from",
    "does",
    "what",
    "offer",
    "offers",
    "service",
    "services",
    ...(titleKey.match(/[a-z]{4,}/g) ?? []),
  ]);
  const topicWords = (line: string) =>
    (line.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter(
      (word) => !genericWords.has(word),
    );
  const words = new Set(topicWords(headline));
  const sharedTopic = (line: string) =>
    topicWords(line).some((word) => words.has(word));
  const support = best(
    candidates.filter(
      (x) =>
        x.text.length >= 15 &&
        x.text.length <= 95 &&
        x.text.split(/\s+/).length <= 16 &&
        !lessonHeadline.test(x.text) &&
        sharedTopic(x.text),
    ),
    excluded,
    (x) =>
      score(x) +
      (chosen?.source === x.source ? 2 : 0) +
      (prose.some((v) => v.text === x.text) ? 2 : 0) +
      (kind === "educational" && educational.test(x.text) ? 4 : 0) +
      (kind === "promotional" && cta.test(x.text) ? 8 : 0),
  );
  return { headline, supporting: support?.text ?? "", limitation };
}
