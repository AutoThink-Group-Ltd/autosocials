// Libraries and fonts every AutoToast render server ships (GET /v1/capabilities mirrors this list).
export const BUILTIN_SCRIPTS = [
  "gsap.min.js", // legacy alias, rewritten to _lib/gsap/gsap.min.js on submit
  "_lib/gsap/gsap.min.js",
  "_lib/lottie/lottie.min.js",
  "_lib/anime/anime.min.js",
  "_lib/three/three.module.min.js",
];
export const GSAP_PLUGINS = ["SplitText", "MorphSVGPlugin", "DrawSVGPlugin", "CustomEase", "MotionPathPlugin", "Flip", "ScrambleTextPlugin"];

export const BUILTIN_FONTS = ["inter", "roboto", "open-sans", "montserrat", "poppins", "lato", "oswald", "raleway", "nunito", "playfair-display", "merriweather", "bebas-neue", "anton", "archivo-black", "dm-sans", "dm-serif-display", "space-grotesk", "sora", "manrope", "outfit", "figtree", "plus-jakarta-sans", "work-sans", "rubik", "karla", "barlow", "barlow-condensed", "fira-sans", "ibm-plex-sans", "ibm-plex-mono", "jetbrains-mono", "space-mono", "source-sans-3", "pt-sans", "noto-sans", "ubuntu", "quicksand", "josefin-sans", "archivo", "syne", "urbanist", "epilogue", "lora", "libre-baskerville", "cormorant-garamond", "abril-fatface", "righteous", "permanent-marker", "pacifico", "lobster", "caveat", "dancing-script", "lexend", "bangers", "fredoka", "comfortaa", "kanit", "prompt", "teko", "league-spartan"];

/** "Plus Jakarta Sans" -> "plus-jakarta-sans" when the server hosts it. */
export function builtinFontSlug(family: string | null | undefined): string | null {
  if (!family) return null;
  const slug = family.trim().toLowerCase().replace(/['"]/g, "").replace(/\s+/g, "-");
  return BUILTIN_FONTS.includes(slug) ? slug : null;
}

export function isBuiltinPath(p: string): boolean {
  if (BUILTIN_SCRIPTS.includes(p)) return true;
  if (/^_lib\/gsap\/[A-Za-z]+\.min\.js$/.test(p)) return true;
  if (/^_lib\/three\/[\w/.-]+\.js$/.test(p)) return true;
  const f = p.match(/^_fonts\/([a-z0-9-]+)\/(index|700)\.css$/);
  return !!f && BUILTIN_FONTS.includes(f[1]!);
}

export const BUILTINS_BRIEF = `BUILT-IN LIBRARIES (already on the render server; link with relative paths, never inline them):
- GSAP 3.13 core: <script src="_lib/gsap/gsap.min.js"></script>. Plugins: _lib/gsap/<Plugin>.min.js (${GSAP_PLUGINS.join(", ")}); register with gsap.registerPlugin. DrawSVG, MorphSVG, MotionPath, CustomEase and Flip are encouraged for line draws, icon morphs, path moves and layout changes. Do not use SplitText/ScrambleText (whole words only).
- Lottie (_lib/lottie/lottie.min.js) only when a .json animation file is supplied; drive it from the timeline with goToAndStop.
- Hosted fonts: <link rel="stylesheet" href="_fonts/<family>/index.css"> regular and _fonts/<family>/700.css bold. Families: ${BUILTIN_FONTS.join(", ")}.`;
