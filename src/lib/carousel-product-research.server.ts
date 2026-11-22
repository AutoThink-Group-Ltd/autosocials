import sharp from 'sharp';
import { downloadCreativeMedia } from './creative-media.server';
import { carouselMentionsProduct, carouselProductPosition } from './linkedin-carousel';
type Slide = { headline: string; supporting: string; products?: string[] | undefined };
type Product = { name: string; sourceUrl: string; image: string; description?: string };
const known: Product[] = [
  { name: 'Asana', sourceUrl: 'https://asana.com/', image: '/carousel-products/asana.png' },
  { name: 'AgencyAnalytics', sourceUrl: 'https://agencyanalytics.com/', image: '/carousel-products/agencyanalytics.png' },
  { name: 'CallRail', sourceUrl: 'https://www.callrail.com/', image: '/carousel-products/callrail.png' },
  { name: 'Mailchimp', sourceUrl: 'https://mailchimp.com/', image: '/carousel-products/mailchimp.png' },
];
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function mentioned(text: string, name: string): boolean {
  return carouselMentionsProduct({ headline: text, supporting: '' }, name);
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
// Embedded images and downloaded images are decoded and re-encoded before use.
async function raster(value: unknown): Promise<string | undefined> {
  if (typeof value !== 'string' || value.length > 300_000) return;
  const svg = /^data:image\/svg\+xml(?:;(?:charset=utf-8|utf8))?(;base64)?,([\s\S]*)$/i.exec(value);
  if (svg) {
    try { return encodeSvg(svg[1] ? Buffer.from(svg[2]!, 'base64') : Buffer.from(decodeURIComponent(svg[2]!), 'utf8')); } catch { return; }
  }
  if (value.length > 32_000) return;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(value);
  if (!match || !match[2] || match[2].length % 4 !== 0) return;
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length < 16 || bytes.length > 24_000) return;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!((match[1]?.toLowerCase() === 'png' && png) || (match[1]?.toLowerCase() === 'jpeg' && jpeg) || (match[1]?.toLowerCase() === 'webp' && webp))) return;
  return encode(bytes);
}
async function encodeSvg(bytes: Uint8Array): Promise<string | undefined> {
  if (bytes.length > 200_000) return;
  const xml = Buffer.from(bytes).toString('utf8');
  // A passive SVG subset: no entities, processing instructions, external resources,
  // scripts, stylesheets, animation or foreign content. Local fragment paint servers are allowed.
  if (!/^\s*<svg(?:\s|>)/i.test(xml) || /[&\\]|<\?|<!|\bon\w+\s*=|\b(?:href|src)\s*=|@|url\s*\(\s*(?!#[A-Za-z_][\w.-]*\s*\))/i.test(xml)) return;
  const tags = [...xml.matchAll(/<\/?\s*([\w:-]+)/g)].map((m) => m[1]?.toLowerCase());
  const allowed = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'clippath', 'mask', 'lineargradient', 'radialgradient', 'stop', 'title', 'desc']);
  if (!tags.length || tags.some((tag) => !tag || !allowed.has(tag))) return;
  return encode(bytes);
}
async function encode(bytes: Uint8Array): Promise<string | undefined> {
  try {
    const output = await sharp(bytes, { limitInputPixels: 4_000_000, failOn: 'error' }).resize(256, 256, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    const result = `data:image/png;base64,${output.toString('base64')}`;
    return result.length <= 32_000 ? result : undefined;
  } catch { return; }
}
async function provider(path: string, body: object, key: string): Promise<Record<string, unknown>> {
  const response = await fetch(`https://api.firecrawl.dev/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000), redirect: 'error' });
  if (!response.ok || !response.body) throw new Error('Research provider unavailable');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    total += part.value.byteLength;
    if (total > 1_500_000) {
      await reader.cancel();
      throw new Error('Research response too large');
    }
    chunks.push(part.value);
  }
  return object(JSON.parse(Buffer.concat(chunks).toString('utf8')));
}
async function search(query: string, key: string): Promise<unknown[]> {
  const result = await provider('v2/search', { query, sources: ['web'], limit: 5 }, key);
  const rows = Array.isArray(result['data']) ? result['data'] : object(result['data'])['web'];
  return Array.isArray(rows) ? rows : [];
}
async function research(name: string, key: string, established?: Product): Promise<Product | undefined> {
  try {
    const compactName = words(name).replace(/ /g, '');
    if (compactName.length < 4) return;
    const validCandidate = (entry: unknown) => {
      const row = object(entry);
      if (typeof row['url'] !== 'string' || typeof row['title'] !== 'string' || !mentioned(row['title'], name)) return false;
      try {
        const u = new URL(row['url']), labels = u.hostname.toLowerCase().replace(/^www\./, '').split('.');
        return u.protocol === 'https:' && !u.username && !u.password && !u.port && ((labels.length === 2 && labels[0]?.replace(/-/g, '') === compactName) || (labels.length === 3 && labels[0]?.replace(/-/g, '') === compactName && labels[1] === 'co' && labels[2] === 'uk'));
      } catch { return false; }
    };
    let entries = established ? [{ url: established.sourceUrl, title: name }]
      : (await search(`${name} official website`, key)).filter(validCandidate);
    if (!entries.length) {
      entries = (await search(`${name} site:${compactName}.com`, key)).filter(validCandidate);
    }
    const visited = new Set<string>();
    for (const entry of entries.slice(0, 3)) {
      const row = object(entry);
      const url = new URL(row['url'] as string);
      const sourceUrl = `${url.origin}/`;
      if (visited.has(sourceUrl)) continue;
      visited.add(sourceUrl);
      const scraped = await provider('v2/scrape', { url: sourceUrl, formats: ['branding'], onlyMainContent: false }, key);
      const data = object(scraped['data']);
      const metadata = object(data['metadata']);
      const scrapedUrl = metadata['url'] ?? metadata['sourceURL'];
      if (typeof scrapedUrl !== 'string') continue;
      let finalUrl: URL;
      try { finalUrl = new URL(scrapedUrl); if (finalUrl.hostname.replace(/^www\./, '') !== url.hostname.replace(/^www\./, '') || finalUrl.protocol !== 'https:' || finalUrl.port || finalUrl.username || finalUrl.password) continue; } catch { continue; }
      const branding = object(data['branding']);
      const images = object(branding['images']);
      const logo = images['logo'] ?? branding['logo'];
      let image = await raster(logo);
      if (!image && typeof logo === 'string') {
        try {
          const logoUrl = new URL(logo, finalUrl);
          const sameSite = logoUrl.hostname.replace(/^www\./, '') === url.hostname.replace(/^www\./, '');
          let homeLink = false;
          if (typeof images['logoHref'] === 'string') {
            const home = new URL(images['logoHref'], finalUrl);
            homeLink = home.protocol === 'https:' && home.hostname.replace(/^www\./, '') === url.hostname.replace(/^www\./, '') && home.pathname === '/' && !home.search && !home.hash && !home.port && !home.username && !home.password;
          }
          const brandAlt = typeof images['logoAlt'] === 'string' && mentioned(images['logoAlt'], name);
          if (logoUrl.protocol === 'https:' && (sameSite || (brandAlt && homeLink)) && !logoUrl.port && !logoUrl.username && !logoUrl.password) {
            const downloaded = await downloadCreativeMedia(logoUrl.href, { expected: 'image', maxBytes: 2_000_000, allowSvg: true, timeoutMs: 10_000 });
            image = downloaded.contentType === 'image/svg+xml' ? await encodeSvg(downloaded.bytes) : await encode(downloaded.bytes);
          }
        } catch { /* Invalid or inaccessible image. */ }
      }
      const description = metadata['description'] ?? established?.description;
      if (image) return { name, sourceUrl, image, ...(typeof description === 'string' ? { description: description.slice(0, 300) } : {}) };
    }
  } catch { /* Fall back to previously verified artwork when available. */ }
  return undefined;
}
export async function resolveCarouselProducts(slides: Slide[]): Promise<Product[][]> {
  const names = new Set<string>();
  for (const slide of slides.slice(0, 30)) {
    for (const product of known) if (carouselMentionsProduct(slide, product.name)) names.add(product.name);
    for (const name of (slide.products ?? []).slice(0, 8)) {
      if (typeof name !== 'string' || name.length > 80 || !carouselMentionsProduct(slide, name) || words(name).length < 3) continue;
      const canonical = words(name).replace(/ /g, '');
      names.add(known.find((p) => words(p.name).replace(/ /g, '') === canonical)?.name ?? name.trim());
    }
  }
  const resolved = new Map<string, Product>();
  const key = process.env['FIRECRAWL_API_KEY']?.trim();
  const orderedNames = [...names].slice(0, 12);
  const products = await Promise.all(orderedNames.map(async (name) => {
    const established = known.find((product) => product.name === name);
    return (key ? await research(name, key, established) : undefined) ?? established;
  }));
  products.forEach((product, index) => { if (product) resolved.set(orderedNames[index]!, product); });
  return slides.map((slide) => [...resolved.values()]
    .filter((product) => carouselMentionsProduct(slide, product.name))
    .sort((a, b) => carouselProductPosition(slide, a.name) - carouselProductPosition(slide, b.name))
    .slice(0, 4));
}
