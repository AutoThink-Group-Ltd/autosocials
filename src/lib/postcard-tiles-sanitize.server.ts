import { parse, serializeOuter } from "parse5";
import {
  downloadCreativeMedia,
  inspectCreativeMediaBytes,
} from "./creative-media.server";
import { imageHeader } from "./film-qa";

// Postcards markup is untrusted. Only a declared square can become a tile;
// do not crop, resize, or pretend an email is a square design.
type Node = {
  nodeName: string;
  tagName?: string;
  value?: string;
  attrs?: { name: string; value: string }[];
  childNodes?: Node[];
  parentNode?: Node;
};
const forbidden = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "base",
  "link",
  "meta",
  "svg",
  "math",
  "audio",
  "video",
  "source",
  "canvas",
  "template",
  "frame",
  "frameset",
  "portal",
  "applet",
]);
const cssUnsafe = (value: string) =>
  /(?:url\s*\(|@import|@font-face|expression\s*\(|-moz-binding|behavior\s*:|image-set\s*\(|\\|\/\*)/i.test(
    value,
  ) ||
  [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 && ![9, 10, 13].includes(code);
  });
const attr = (n: Node, key: string) =>
  n.attrs?.find((a) => a.name.toLowerCase() === key)?.value ?? "";
function declaredSquare(n: Node) {
  const style = attr(n, "style");
  const read = (name: "width" | "height") => {
    const htmlValue = attr(n, name);
    const cssValue = new RegExp(
      `(?:^|;)\\s*${name}\\s*:\\s*(\\d+)px\\s*(?:;|$)`,
      "i",
    ).exec(style)?.[1];
    return /^\d+$/.test(htmlValue) ? Number(htmlValue) : Number(cssValue);
  };
  const width = read("width"),
    height = read("height");
  return !!n.tagName &&
    !["img", "html", "body"].includes(n.tagName) &&
    width >= 200 &&
    width <= 2048 &&
    width === height
    ? width
    : null;
}
function all(root: Node) {
  const out: Node[] = [],
    stack = [root];
  while (stack.length) {
    const n = stack.pop()!;
    out.push(n);
    if (out.length > 12000)
      throw new Error("The design is too complex to prepare safely.");
    stack.push(...(n.childNodes ?? []));
  }
  return out;
}
function checkedImage(bytes: Uint8Array) {
  if (!bytes.length || bytes.byteLength > 3_000_000)
    throw new Error("A design image exceeded the safe size limit.");
  const format = inspectCreativeMediaBytes(bytes, "image");
  const dimensions = imageHeader(Uint8Array.from(bytes).buffer);
  if (!dimensions || dimensions.width * dimensions.height > 40_000_000)
    throw new Error("A design image could not be verified.");
  return `data:${format.contentType};base64,${Buffer.from(bytes).toString("base64")}`;
}
export async function preparePostcardSquare(
  html: string,
  download = downloadCreativeMedia,
) {
  if (!html || Buffer.byteLength(html) > 1_000_000)
    throw new Error("The Postcards export was empty or too large.");
  const doc = parse(html) as unknown as Node;
  const nodes = all(doc),
    candidates = nodes.filter(declaredSquare);
  if (candidates.length !== 1)
    throw new Error(
      "Postcards did not return one explicitly sized square design. No image was rendered.",
    );
  const square = candidates[0]!;
  const size = declaredSquare(square)!;
  const styles = nodes
    .filter((n) => n.tagName === "style")
    .map((n) => (n.childNodes ?? []).map((x) => x.value ?? "").join("\n"));
  if (styles.some(cssUnsafe))
    throw new Error(
      "The design uses external or unsafe styles and could not be rendered safely.",
    );
  const work = all(square);
  let count = 0,
    total = 0;
  for (const n of work) {
    if (!n.tagName || forbidden.has(n.tagName)) continue;
    const keep: { name: string; value: string }[] = [];
    for (const a of n.attrs ?? []) {
      const name = a.name.toLowerCase();
      if (name === "style" && cssUnsafe(a.value))
        throw new Error(
          "The design uses external or unsafe styles and could not be rendered safely.",
        );
      if (
        name.startsWith("on") ||
        [
          "href",
          "srcset",
          "background",
          "formaction",
          "action",
          "poster",
          "xmlns",
          "xlink:href",
        ].includes(name)
      )
        continue;
      if (name === "src") {
        if (n.tagName !== "img") continue;
        if (++count > 12)
          throw new Error("The design has too many images to prepare safely.");
        let image: string;
        if (/^data:image\/(?:png|jpeg|webp);base64,/i.test(a.value)) {
          const encoded = a.value.split(",")[1] ?? "";
          if (
            !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
              encoded,
            )
          )
            throw new Error("A design image could not be verified.");
          const bytes = Buffer.from(encoded, "base64");
          total += bytes.length;
          image = checkedImage(bytes);
        } else {
          const media = await download(a.value, {
            expected: "image",
            maxBytes: 3_000_000,
          });
          total += media.bytes.length;
          image = checkedImage(media.bytes);
        }
        if (total > 12_000_000)
          throw new Error("The design images exceed the safe size limit.");
        keep.push({ name: "src", value: image });
        continue;
      }
      if (
        [
          "id",
          "class",
          "style",
          "width",
          "height",
          "align",
          "valign",
          "bgcolor",
          "border",
          "cellpadding",
          "cellspacing",
          "colspan",
          "rowspan",
          "alt",
          "role",
        ].includes(name)
      )
        keep.push({ name, value: a.value });
    }
    n.attrs = keep;
  }
  for (const n of work)
    if (n.childNodes)
      n.childNodes = n.childNodes.filter(
        (child) =>
          !child.tagName ||
          (!forbidden.has(child.tagName) && child.tagName !== "style"),
      );
  const safe = serializeOuter(square as never);
  const styleText = styles.join("\n").replace(/<\/style/gi, "");
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'self' 'unsafe-inline'"><style>${styleText}\nhtml,body{margin:0;width:1000px;height:1000px;overflow:hidden}#postcard-root{position:relative;width:1000px;height:1000px;overflow:hidden}#postcard-design{width:${size}px;height:${size}px;transform-origin:top left;transform:scale(${1000 / size})}</style><script src="_lib/gsap/gsap.min.js"></script></head><body><div id="postcard-root" data-composition-id="main" data-start="0" data-duration="1" data-width="1000" data-height="1000"><div id="postcard-design">${safe}</div></div><script>window.__timelines=window.__timelines||{};window.__timelines.main=gsap.timeline({paused:true});</script></body></html>`;
}
