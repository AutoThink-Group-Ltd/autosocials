import catalogue from "./creative-providers/higgsfield-catalog.generated.json";

/** Public documentation knowledge. Execution/availability remain owned by creative-providers/registry.ts. */
export const HIGGSFIELD_KNOWLEDGE_CHECKED_AT = "2026-11-04";
export type HiggsfieldSchema = {
  [key: string]: unknown;
  type?: string;
  required?: string[];
  properties?: Record<string, HiggsfieldSchema>;
  $defs?: Record<string, HiggsfieldSchema>;
  enum?: unknown[];
  anyOf?: HiggsfieldSchema[];
  items?: HiggsfieldSchema;
};
export type HiggsfieldWorkflowKnowledge = {
  slug: string;
  name: string;
  endpointId: string;
  sourceUrl: string;
  inputSchema: HiggsfieldSchema;
  requiredInputs: string[];
  notes: string[];
  output: "images[].url" | "video.url" | "character-reference";
  documented: true;
  accountAccessVerified: false;
};
export type HiggsfieldFamilyKnowledge = {
  slug: string;
  name: string;
  vendor: string;
  category: "image" | "video";
  description: string;
  workflowCount: number;
  sourceUrl: string;
  workflows: HiggsfieldWorkflowKnowledge[];
};
type CatalogueEntry = { kind: string; family: string; name: string; slug: string; endpoint: string; documentation: string; schema: HiggsfieldSchema; notes: string[] };

const families: Array<Omit<HiggsfieldFamilyKnowledge, "workflows">> = [
  {
    "slug": "soul-standard",
    "name": "SOUL",
    "vendor": "Higgsfield",
    "category": "image",
    "description": "Generate images with selectable styles and adjustable style strength.",
    "workflowCount": 1,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/soul-standard.md"
  },
  {
    "slug": "soul-2",
    "name": "SOUL V2",
    "vendor": "Higgsfield",
    "category": "image",
    "description": "Generate portraits, fashion and editorial images with SOUL styles.",
    "workflowCount": 1,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/soul-2.md"
  },
  {
    "slug": "soul-cinema",
    "name": "SOUL Cinema",
    "vendor": "Higgsfield",
    "category": "image",
    "description": "Generate cinema-inspired still images from text prompts.",
    "workflowCount": 1,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/soul-cinema.md"
  },
  {
    "slug": "soul-id",
    "name": "Soul ID",
    "vendor": "Higgsfield",
    "category": "image",
    "description": "Train a personal character from reference images for use with compatible SOUL workflows.",
    "workflowCount": 1,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/soul-id.md"
  },
  {
    "slug": "marketing-studio-image",
    "name": "Marketing Studio Image",
    "vendor": "Higgsfield",
    "category": "image",
    "description": "Generate and edit campaign images, with optional preset-based prompt enhancement.",
    "workflowCount": 3,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/marketing-studio-image.md"
  },
  {
    "slug": "ads-studio",
    "name": "Ads Studio",
    "vendor": "Higgsfield",
    "category": "image",
    "description": "Turn a marketing brief and optional product references into 1–8 ad concepts rendered as images with GPT Image 2.5 Flare.",
    "workflowCount": 1,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/ads-studio.md"
  },
  {
    "slug": "grok-image-2",
    "name": "Grok Image 2.0",
    "vendor": "xAI",
    "category": "image",
    "description": "Generate and edit images with up to ten image references.",
    "workflowCount": 1,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/grok-image-2.md"
  },
  {
    "slug": "recraft-v4-1",
    "name": "Recraft V4.1",
    "vendor": "Recraft",
    "category": "image",
    "description": "Generate 1K images with RGB palette and background controls.",
    "workflowCount": 1,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/recraft-v4-1.md"
  },
  {
    "slug": "recraft-v4-1-pro",
    "name": "Recraft V4.1 Pro",
    "vendor": "Recraft",
    "category": "image",
    "description": "Generate 2K images with RGB palette and background controls.",
    "workflowCount": 1,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/recraft-v4-1-pro.md"
  },
  {
    "slug": "recraft-v4-1-utility",
    "name": "Recraft V4.1 Utility",
    "vendor": "Recraft",
    "category": "image",
    "description": "Generate 1K images with RGB palette and background controls.",
    "workflowCount": 1,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/recraft-v4-1-utility.md"
  },
  {
    "slug": "recraft-v4-1-utility-pro",
    "name": "Recraft V4.1 Utility Pro",
    "vendor": "Recraft",
    "category": "image",
    "description": "Generate 2K images with RGB palette and background controls.",
    "workflowCount": 1,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/recraft-v4-1-utility-pro.md"
  },
  {
    "slug": "qwen-image-3",
    "name": "Qwen Image 3",
    "vendor": "Alibaba",
    "category": "image",
    "description": "Generate images or edit one to three reference images with optional prompt reasoning.",
    "workflowCount": 2,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/qwen-image-3.md"
  },
  {
    "slug": "ideogram-4",
    "name": "Ideogram 4.0",
    "vendor": "Ideogram",
    "category": "image",
    "description": "Generate images with an optional image reference and selectable rendering speed.",
    "workflowCount": 1,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/ideogram-4.md"
  },
  {
    "slug": "z-image-turbo",
    "name": "Z-Image Turbo",
    "vendor": "Alibaba",
    "category": "image",
    "description": "Generate images at 1K or 2K with optional prompt enhancement.",
    "workflowCount": 1,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/z-image-turbo.md"
  },
  {
    "slug": "genjutsu",
    "name": "Genjutsu",
    "vendor": "Higgsfield",
    "category": "video",
    "description": "Transfer motion, replace objects, or restyle a source video.",
    "workflowCount": 3,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/genjutsu.md"
  },
  {
    "slug": "seedance-2",
    "name": "Seedance 2.0",
    "vendor": "ByteDance",
    "category": "video",
    "description": "Generate videos from text, frames or image, video and audio references.",
    "workflowCount": 3,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/seedance-2.md"
  },
  {
    "slug": "seedance-2-5",
    "name": "Seedance 2.5",
    "vendor": "ByteDance",
    "category": "video",
    "description": "Generate, edit and extend videos using text and multimodal references.",
    "workflowCount": 5,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/seedance-2-5.md"
  },
  {
    "slug": "kling-2-5-turbo",
    "name": "Kling 2.5 Turbo",
    "vendor": "Kling",
    "category": "video",
    "description": "Generate videos with Standard and Pro workflow variants.",
    "workflowCount": 3,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/kling-2-5-turbo.md"
  },
  {
    "slug": "kling-2-6",
    "name": "Kling 2.6",
    "vendor": "Kling",
    "category": "video",
    "description": "Generate videos from text or a starting image, with optional sound.",
    "workflowCount": 2,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/kling-2-6.md"
  },
  {
    "slug": "kling-2-6-motion-control",
    "name": "Kling 2.6 Motion Control",
    "vendor": "Kling",
    "category": "video",
    "description": "Apply motion from a source video to an image with Standard or Pro processing.",
    "workflowCount": 2,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/kling-2-6-motion-control.md"
  },
  {
    "slug": "kling-3",
    "name": "Kling 3.0",
    "vendor": "Kling",
    "category": "video",
    "description": "Generate videos with Standard, Pro, 4K and Turbo workflow variants.",
    "workflowCount": 8,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/kling-3.md"
  },
  {
    "slug": "kling-3-motion-control",
    "name": "Kling 3.0 Motion Control",
    "vendor": "Kling",
    "category": "video",
    "description": "Apply motion from a source video to an image with Standard or Pro processing.",
    "workflowCount": 2,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/kling-3-motion-control.md"
  },
  {
    "slug": "kling-o3",
    "name": "Kling O3",
    "vendor": "Kling",
    "category": "video",
    "description": "Create and edit videos with first/last frames, image references and video references.",
    "workflowCount": 4,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/kling-o3.md"
  },
  {
    "slug": "kling-omni",
    "name": "Kling Omni",
    "vendor": "Kling",
    "category": "video",
    "description": "Create and edit videos with image and video references.",
    "workflowCount": 4,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/kling-omni.md"
  },
  {
    "slug": "happy-horse-1",
    "name": "Happy Horse 1.0",
    "vendor": "Alibaba",
    "category": "video",
    "description": "Generate videos from text, a starting image or reference images.",
    "workflowCount": 3,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/happy-horse-1.md"
  },
  {
    "slug": "happy-horse-1-1",
    "name": "HappyHorse 1.1",
    "vendor": "Alibaba",
    "category": "video",
    "description": "Generate videos from text, a starting image or reference images.",
    "workflowCount": 3,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/happy-horse-1-1.md"
  },
  {
    "slug": "wan-3",
    "name": "Wan 3.0",
    "vendor": "Alibaba",
    "category": "video",
    "description": "Generate videos from text, frames or multimodal references.",
    "workflowCount": 3,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/wan-3.md"
  },
  {
    "slug": "wan-3-prime",
    "name": "Wan 3.0 Prime",
    "vendor": "Alibaba",
    "category": "video",
    "description": "Generate videos from text, frames or multimodal references with Wan 3.0 Prime.",
    "workflowCount": 3,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/wan-3-prime.md"
  },
  {
    "slug": "cinema-studio-4",
    "name": "Cinema Studio 4.0",
    "vendor": "Higgsfield",
    "category": "video",
    "description": "Create video shots with camera and style controls and media references.",
    "workflowCount": 1,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/cinema-studio-4.md"
  },
  {
    "slug": "ltx-2-5",
    "name": "LTX-2.5",
    "vendor": "Lightricks",
    "category": "video",
    "description": "Generate videos from text or images with Fast and Pro variants.",
    "workflowCount": 4,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/ltx-2-5.md"
  },
  {
    "slug": "minimax-h3",
    "name": "MiniMax H3",
    "vendor": "MiniMax",
    "category": "video",
    "description": "Generate videos from text, frames or multimodal references.",
    "workflowCount": 3,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/minimax-h3.md"
  },
  {
    "slug": "hailuo-2-3",
    "name": "Hailuo 2.3",
    "vendor": "MiniMax",
    "category": "video",
    "description": "Generate videos from text or an image with Hailuo 2.3 Standard.",
    "workflowCount": 2,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/hailuo-2-3.md"
  },
  {
    "slug": "pixverse-v6",
    "name": "PixVerse V6",
    "vendor": "PixVerse",
    "category": "video",
    "description": "Generate videos from text or images with optional sound.",
    "workflowCount": 2,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/pixverse-v6.md"
  },
  {
    "slug": "wan-2-6",
    "name": "Wan 2.6",
    "vendor": "Alibaba",
    "category": "video",
    "description": "Generate videos from text, images or video references.",
    "workflowCount": 3,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/wan-2-6.md"
  },
  {
    "slug": "wan-2-7",
    "name": "Wan 2.7",
    "vendor": "Alibaba",
    "category": "video",
    "description": "Generate videos from text, frames or multimodal references.",
    "workflowCount": 3,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/wan-2-7.md"
  },
  {
    "slug": "grok-video-1-5",
    "name": "Grok Imagine Video 1.5",
    "vendor": "xAI",
    "category": "video",
    "description": "Generate videos from text, images or an audio reference.",
    "workflowCount": 1,
    "sourceUrl": "https://docs.higgsfield.ai/docs/models/grok-video-1-5.md"
  }
];

const soulIdTraining = {
  "slug": "soul-id/create-character",
  "endpointId": "v1/custom-references",
  "inputSchema": {
    "$defs": {
      "ImageUrlInputImageSchema": {
        "properties": {
          "type": {
            "const": "image_url",
            "title": "Type",
            "type": "string"
          },
          "image_url": {
            "format": "uri",
            "maxLength": 2083,
            "minLength": 1,
            "title": "Image Url",
            "type": "string"
          }
        },
        "required": [
          "type",
          "image_url"
        ],
        "title": "ImageUrlInputImageSchema",
        "type": "object"
      },
      "SoulModelVersion": {
        "enum": [
          "v1",
          "v2",
          "cinema"
        ],
        "title": "SoulModelVersion",
        "type": "string"
      }
    },
    "properties": {
      "name": {
        "maxLength": 100,
        "title": "Name",
        "type": "string"
      },
      "model_version": {
        "$ref": "#/$defs/SoulModelVersion",
        "default": "v1"
      },
      "input_images": {
        "items": {
          "$ref": "#/$defs/ImageUrlInputImageSchema"
        },
        "maxItems": 100,
        "minItems": 1,
        "title": "Input Images",
        "type": "array"
      }
    },
    "required": [
      "name",
      "input_images"
    ],
    "title": "CreateCustomReferenceSchema",
    "type": "object"
  },
  "notes": [
    "Soul ID trains a reusable character reference. This is not an image-generation endpoint; do not POST to /soul-id.",
    "Use POST /v1/custom-references with application/json. name has a maximum length of 100; input_images must contain 1–100 \\{\"type\":\"image_url\",\"image_url\":\"...\"} objects.",
    "model_version accepts v1, v2, cinema; its default is v1. Choose the matching generation family.",
    "The creation response returns id and status. Poll GET /v1/custom-references/\\{id}; statuses are not_ready, queued, in_progress, completed, and failed.",
    "After completion, pass the returned id as custom_reference_id to the matching Soul generation endpoint. References are scoped to the account that created them.",
    "When the account already has the maximum number of references in training, creation returns 429 Too Many Requests with a Retry-After header. Retry after that delay; nothing is charged for the rejected request."
  ]
};

/** Preserve the existing generated schema catalogue as the only generation schema source. */
export const HIGGSFIELD_MODEL_KNOWLEDGE: HiggsfieldFamilyKnowledge[] = families.map<HiggsfieldFamilyKnowledge>((family) => ({
  ...family,
  workflows: family.slug === "soul-id" ? [{
    slug: soulIdTraining.slug, name: "Soul ID — Create character",
    endpointId: soulIdTraining.endpointId, sourceUrl: family.sourceUrl.replace(".md", "/create-character.md"),
    inputSchema: soulIdTraining.inputSchema, requiredInputs: soulIdTraining.inputSchema.required,
    notes: soulIdTraining.notes, output: "character-reference", documented: true, accountAccessVerified: false,
  }] : (catalogue as unknown as CatalogueEntry[]).filter((entry) => entry.slug.startsWith(family.slug + "/")).map<HiggsfieldWorkflowKnowledge>((entry) => ({
    slug: entry.slug, name: entry.name, endpointId: entry.endpoint,
    sourceUrl: entry.documentation, inputSchema: entry.schema,
    requiredInputs: entry.schema.required ?? [], notes: entry.notes,
    output: entry.kind === "video" ? "video.url" : "images[].url",
    documented: true, accountAccessVerified: false,
  })),
}));

/** Product-selection inferences from documented controls, not measured quality, cost or latency rankings. */
export const HIGGSFIELD_RECOMMENDATION_INFERENCES = [
  { families: ["soul-standard", "soul-2", "soul-cinema"], useCase: "Style-led stills, portraits or editorial concepts; choose the documented SOUL style and matching trained character version when identity consistency matters." },
  { families: ["marketing-studio-image", "ads-studio"], useCase: "Product/campaign image concepts; use current authenticated presets where required. Ads Studio creates image concepts, not a published ad campaign." },
  { families: ["recraft-v4-1", "recraft-v4-1-pro", "recraft-v4-1-utility", "recraft-v4-1-utility-pro"], useCase: "Brand image exploration when explicit palette and background controls matter; select the documented resolution tier." },
  { families: ["grok-image-2", "qwen-image-3", "ideogram-4", "z-image-turbo"], useCase: "Still-image generation or editing: compare reference-image support and exact controls before choosing a workflow." },
  { families: ["genjutsu", "kling-2-6-motion-control", "kling-3-motion-control"], useCase: "Existing footage or performance-driven work: motion transfer/control needs a source video; object swap and restyle are distinct Genjutsu workflows." },
  { families: ["seedance-2", "seedance-2-5", "kling-o3", "kling-omni"], useCase: "Reference-led scenes or keyframe continuity; choose first/last-frame, reference, edit or extend by the supplied material. Edit and extend are separate operations." },
  { families: ["kling-3", "ltx-2-5", "cinema-studio-4"], useCase: "Camera-led or shot-structured scenes: inspect camera controls and multi-shot rules. Cinema Studio creates new video; it does not expose editing through its generate endpoint." },
  { families: ["wan-3", "wan-3-prime", "wan-2-6", "wan-2-7", "minimax-h3", "hailuo-2-3", "happy-horse-1", "happy-horse-1-1", "pixverse-v6", "grok-video-1-5", "kling-2-5-turbo", "kling-2-6"], useCase: "General scene generation: shortlist using required media, native-audio controls, duration and aspect ratio. Do not infer measured speed, fidelity or lowest cost from a model name." },
] as const;

export const HIGGSFIELD_KNOWLEDGE_RULES = [
  "This is official public API documentation knowledge checked 2026-11-04, not account entitlement, a quality benchmark or proof a paid generation succeeded.",
  "Use only registered AutoSocials capabilities for execution; the registry, app validation and server adapters own supported operations and any stricter limits. Soul ID training is knowledge-only unless a dedicated tool is registered.",
  "A Higgsfield website feature or named preset is not automatically an API capability. No website-only feature is represented here as executable. Discover current models in console.higgsfield.ai and verify the selected workflow docs; OpenAPI is supplementary.",
  "Every workflow has its own input schema. Preserve enums, units, reference roles, nested constraints, defaults and usage notes; do not transpose parameters between model families.",
  "Output image/video URLs in docs examples are placeholders, not demos. Fetch live authenticated style/preset IDs; never invent them, account-owned element IDs or trained character IDs.",
  "Choose a model using documented controls and supplied assets. Recommendations below are inferences; no measured ranking, generation latency, price or success-rate claim is available.",
  "Get an authenticated per-request USD estimate before paid generation; public example prices are illustrative. Concurrency and queue limits depend on the account/model; honour Retry-After.",
  "Generation returns a request handle; poll its status_url or verify webhooks. Images finish as images[].url; videos as video.url. Ads Studio can return indexed batch images plus slot errors. Soul ID returns a character reference and has a separate training lifecycle.",
  "Retain completed files in application storage: standard provider retention is seven days after completion and expires_at is authoritative. Preserve existing app consent, approval and publication rules.",
  "Credentials remain server-side. Public HTTPS media or the documented presigned upload flow supply references; never send provider credentials to a storage upload URL.",
] as const;

export type HiggsfieldKnowledgeContextOptions = {
  query?: string;
  family?: string;
  endpoint?: string;
  maxModels?: number;
  maxChars?: number;
};

function boundedNumber(value: number | undefined, fallback: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value!))) : fallback;
}

/** Whole-record, bounded retrieval for Sam; catalogue metadata is separated from execution permissions. */
export function getHiggsfieldKnowledgeContext(options: HiggsfieldKnowledgeContextOptions = {}): string {
  const maxChars = boundedNumber(options.maxChars, 9000, 1200, 16000);
  const maxModels = boundedNumber(options.maxModels, 5, 1, 12);
  const query = (options.query ?? "").toLowerCase();
  const ignored = new Set(["the", "for", "and", "with", "this", "that", "which", "best", "model", "models", "higgsfield", "compare", "comparison", "recommend", "video", "videos", "image", "images"]);
  const tokens = query.match(/[a-z0-9]+/g)?.filter((token) => token.length > 2 && !ignored.has(token)).slice(0, 32) ?? [];
  const cameraIntent = /\b(cinem(?:a|atic)|camera|property|properties|estate|walkthrough|tour|interiors?)\b/.test(query);
  const videoIntent = /\b(videos?|films?|animate|animation|footage|clips?)\b/.test(query)
    || (cameraIntent && !/\b(stills?|images?|photos?|photography|portraits?)\b/.test(query));
  const imageIntent = !videoIntent && /\b(stills?|images?|photos?|photography|portraits?)\b/.test(query);
  const motionIntent = /\b(motion|transfer|restyle|swap|performance)\b/.test(query);
  // Retrieval tie-breaks favour current general-purpose contracts, not measured output quality.
  const retrievalPriority: Record<string, number> = { "kling-3": 8, "kling-o3": 6, "kling-omni": 5, "seedance-2-5": 8, "seedance-2": 1, "cinema-studio-4": 7, "ltx-2-5": 6, "wan-3-prime": 5 };
  const ranked = HIGGSFIELD_MODEL_KNOWLEDGE
    .filter((model) => !options.family || model.slug === options.family || model.name.toLowerCase() === options.family.toLowerCase())
    .filter((model) => !options.endpoint || model.workflows.some((workflow) => workflow.endpointId === options.endpoint))
    .map((model, index) => {
      const title = (model.name + " " + model.slug).toLowerCase();
      const text = (model.description + " " + model.workflows.map((workflow) => workflow.name).join(" ")).toLowerCase();
      let score = tokens.reduce((sum, token) => sum + (title.includes(token) ? 35 : text.includes(token) ? 2 : 0), 0);
      if (videoIntent) score += model.category === "video" ? 40 : -40;
      if (imageIntent) score += model.category === "image" && model.slug !== "soul-id" ? 40 : -40;
      if (cameraIntent && ["cinema-studio-4", "ltx-2-5", "kling-3", "seedance-2-5"].includes(model.slug)) score += 20;
      if (!motionIntent && (model.slug.includes("motion-control") || model.slug === "genjutsu")) score -= 15;
      if (motionIntent && (model.slug.includes("motion-control") || model.slug === "genjutsu")) score += 20;
      if (model.slug === "soul-id" && !/\b(character|identity|train|training|soul)\b/.test(query)) score -= 30;
      score += retrievalPriority[model.slug] ?? 0;
      return { model, index, score };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, maxModels).map(({ model }) => model);
  const lines: string[] = ["HIGGSFIELD DOCUMENTED MODEL KNOWLEDGE", ...HIGGSFIELD_KNOWLEDGE_RULES.map((rule) => "- " + rule)];
  // A small requested budget still keeps the distinction between documented and executable availability.
  let context = lines.join("\n");
  if (context.length > maxChars) return lines.slice(0, 4).join("\n").slice(0, maxChars);
  const append = (value: string): boolean => {
    if (context.length + value.length + 1 > maxChars) return false;
    context += "\n" + value;
    return true;
  };
  append("Catalogue families (not permission to execute): " + HIGGSFIELD_MODEL_KNOWLEDGE.map((model) => model.name).join("; "));
  // Include every shortlisted family before spending the remaining budget on large schemas.
  for (const model of ranked) {
    append(JSON.stringify({ family: model.name, description: model.description, source: model.sourceUrl,
      recommendationInferences: HIGGSFIELD_RECOMMENDATION_INFERENCES.filter((item) => (item.families as readonly string[]).includes(model.slug)).map((item) => item.useCase),
      workflows: model.workflows.filter((item) => !options.endpoint || item.endpointId === options.endpoint).map((item) => ({ name: item.name, endpoint: item.endpointId, required: item.requiredInputs, output: item.output })) }));
  }
  for (const model of ranked) {
    for (const workflow of model.workflows.filter((item) => !options.endpoint || item.endpointId === options.endpoint)) {
      // Compact summary first so large schemas cannot hide the remaining workflow choices.
      if (!append(JSON.stringify({ workflow: workflow.name, endpoint: workflow.endpointId, source: workflow.sourceUrl,
        required: workflow.requiredInputs, output: workflow.output, notes: workflow.notes }))) continue;
      append(JSON.stringify({ workflow: workflow.slug, inputSchema: workflow.inputSchema }));
    }
  }
  append("Context is bounded; consult structured HIGGSFIELD_MODEL_KNOWLEDGE and the selected workflow source for omitted schemas or families. Knowledge does not authorize a new tool call.");
  return context;
}

