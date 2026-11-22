export type DeveloperPage = {
  slug: string;
  title: string;
  description: string;
  sections: { heading: string; paragraphs: string[]; checklist?: boolean }[];
};

// Public documentation corpus: rendered as HTML and as plain text in llms-full.txt.
export const developerPages: DeveloperPage[] = [
  {
    slug: "self-hosting",
    title: "Self-hosting checklist",
    description:
      "Prepare an isolated AutoSocials installation and check required services before enabling features.",
    sections: [
      {
        heading: "Status and prerequisites",
        paragraphs: [
          "Start from a reviewed public source release when it becomes available. The first clean install is still pending. The Compose recipe runs the application. Set up Supabase, Edge Functions, storage and scheduled jobs separately.",
          "You need a supported Node and container toolchain, an independently operated Supabase project or compatible stack, and a canonical HTTPS origin for external use. See https://supabase.com/docs/guides/self-hosting and https://supabase.com/docs/guides/self-hosting/self-hosted-functions. The API key setup guide is at https://autosocials.com/developers/api-key-setup.",
        ],
      },
      {
        heading: "Installation checklist",
        checklist: true,
        paragraphs: [
          "Review the source release, licence and migrations. Start with an empty Supabase project for your installation. Use synthetic data for setup checks.",
          "Configure Supabase database, Auth, Storage, RLS, buckets, auth redirect URLs and required Edge Functions. Point the application server and functions at the same project. Review function authentication settings and apply the documented self-host migration replacements before running migrations.",
          "Copy release/env.example to release/self-host.env and keep it private and untracked. Fill in the Supabase settings from the matrix below. Leave optional agent and provider controls off while you verify the basics.",
          "From the root of the reviewed source release, run docker compose --env-file release/self-host.env -f release/compose.yml up --build. The recipe binds localhost. Set up a TLS reverse proxy before exposing your installation.",
          "Sign in with a test user and save a written draft in one workspace. Use a second test user outside the workspace to check that its private data stays private. Then enable provider features one at a time.",
        ],
      },
      {
        heading: "App configuration matrix",
        paragraphs: [
          "Build-time browser values: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY and VITE_SUPABASE_PROJECT_ID identify the intended project. They are public values; a build-time change requires a rebuild. Never place a privileged credential in a VITE_ variable.",
          "App-server runtime: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY as applicable, and SUPABASE_SERVICE_ROLE_KEY for server-only administrative operations. Treat the service-role key as privileged: it bypasses RLS and must remain private. See https://supabase.com/docs/guides/getting-started/api-keys.",
          "Edge Functions runtime: SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY as required by each function, plus that function’s provider secrets. Configure them through the Supabase deployment’s supported secret mechanism; browser build variables are not a substitute. See https://supabase.com/docs/guides/functions/secrets.",
          "Agent controls in the app-server process: AUTOSOCIALS_AGENT_API_ENABLED and separately AUTOSOCIALS_AGENT_DRAFTS_ENABLED, AUTOSOCIALS_AGENT_PUBLISHING_ENABLED, AUTOSOCIALS_AGENT_TILE_PLANNING_ENABLED and AUTOSOCIALS_AGENT_RESEARCH_PROVIDER_ENABLED. Set AUTOSOCIALS_AGENT_ORIGIN to your canonical HTTPS origin and optionally AUTOSOCIALS_AGENT_ALLOWED_ORIGINS to trusted browser origins. Gates default off; enabling the API alone does not enable its writes.",
        ],
      },
      {
        heading: "Verification and recovery",
        checklist: true,
        paragraphs: [
          "Confirm the running app points to your project without displaying credentials. Check sign-in, private storage and the deployed Edge Functions.",
          "For agent access, keep writes gated and inspect your installation's /openapi.json and /mcp-tools.json. Verify an authorised channel read using a test account, then check that a missing or revoked credential is rejected. A workspace with zero connected channels should return an empty list.",
          "Record tested versions, results and pending integrations. Back up database and storage, test restores and review migration and provider callback changes before upgrades. Database rollback and container rollback are separate steps.",
        ],
      },
    ],
  },
  {
    slug: "api-key-setup",
    title: "API key and provider setup",
    description:
      "Configure optional integrations in the correct server or Edge Function environment and verify safely.",
    sections: [
      {
        heading: "Before adding a key",
        paragraphs: [
          "Complete https://autosocials.com/developers/self-hosting first. Use operator-owned credentials scoped to the intended isolated environment. Store secrets in your host or Supabase secret manager, never in source control, prompts, logs, browser VITE_ variables or public support requests. Configured means only that a value is present; it does not prove provider access or a working integration. No first-install provider test has been verified.",
          "A workspace agent API key is separate from provider credentials and Supabase keys. In an authorised workspace, use Settings → Agent access to create a labelled key, choose the least privileges and expiry, copy it once and store it securely. Use it as a bearer token for REST; OAuth is used for MCP. Confirm current support and gates in your own deployed catalogue before use.",
        ],
      },
      {
        heading: "Research and AI providers",
        paragraphs: [
          "Firecrawl: FIRECRAWL_API_KEY in the app-server runtime for server-side discovery and in Edge Function secrets for functions that use it. Used for website research and capture. Check enabled feature status, then run a bounded public-page lookup against a test URL only after reviewing provider charges. Documentation: https://docs.firecrawl.dev/.",
          "Apify: APIFY_API_TOKEN in the app-server runtime for research; some Edge Function research code also recognises APIFY_API_TOKEN or APIFY_TOKEN. Confirm the feature gate, authorised actor access and budget, then test one public profile in an isolated workspace with explicit consent. Documentation: https://docs.apify.com/platform/integrations/api.",
          "Virlo: VIRLO_API_KEY and VIRLO_ENABLED in the app-server runtime where Virlo is used; research Edge Functions may also need VIRLO_API_KEY. Confirm enabled status and provider access, then run a small public lookup in a test workspace after checking usage. Use your Virlo provider documentation for account-specific credentials; its setup has not been verified here.",
          "OpenAI: OPENAI_API_KEY in the app-server runtime and in Edge Function secrets only where those functions call OpenAI. Verify the configured model and quota with a minimal authorised test in an isolated workspace; generation can incur charges. Documentation: https://platform.openai.com/docs/overview.",
        ],
      },
      {
        heading: "Creative, rendering and email",
        paragraphs: [
          "Higgsfield: HF_API_KEY_ID and HF_API_KEY_SECRET in the app-server runtime. Verify both are present privately and the selected model is available; a generation test is billable and requires deliberate approval. See https://docs.higgsfield.ai/docs/authentication.",
          "Kie: KIE_API_KEY in the app-server runtime. Check the provider account, configured capability and rate limits without printing the key. Run a small paid test only when authorised; generation remains unverified. See https://docs.kie.ai/.",
          "AutoToast: RENDER_SERVER_URL and RENDER_SERVER_SECRET in the app-server runtime for the independently operated compatible rendering service. Verify endpoint ownership and connectivity with its operator before an authorised test render; no service or compatibility has been verified by this guide.",
          "SendGrid: SENDGRID_API_KEY in the relevant app-server and Edge Function secret environments. Verify the sender or domain in SendGrid first. If you choose to test delivery, use a test address you control and check the delivery result there. See https://www.twilio.com/docs/sendgrid/ui/account-and-settings/api-keys.",
          "Stripe is optional for installations that sell access. Configure STRIPE_SECRET_KEY in the applicable billing functions and STRIPE_WEBHOOK_SECRET for the webhook in the same Stripe test environment. Send a test webhook and confirm the handler accepts the signature before configuring live billing. See https://docs.stripe.com/keys.",
        ],
      },
      {
        heading: "Social OAuth and webhooks",
        paragraphs: [
          "Meta Edge Functions use META_APP_ID and META_APP_SECRET. TikTok uses TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET. The review sandbox uses TIKTOK_SANDBOX_CLIENT_KEY and TIKTOK_REVIEW_SANDBOX_SECRET. LinkedIn uses LINKEDIN_CLIENT_ID and LINKEDIN_SECRET, with optional LINKEDIN_COMPANY_CLIENT_ID and LINKEDIN_COMPANY_SECRET for a company client. For a self-hosted LinkedIn connection, set LINKEDIN_OAUTH_APP_ORIGIN to your app's HTTPS origin in the Edge Function environment. Google-connected functions use GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET. Register exact callback URLs and required permissions with each provider. Authorise a social test account and confirm its name appears in your own workspace. See https://developers.facebook.com/docs/ , https://developers.tiktok.com/doc/overview/ , https://learn.microsoft.com/en-us/linkedin/ and https://developers.google.com/identity/protocols/oauth2.",
          "Agent webhook subscription encryption uses AGENT_WEBHOOK_ENCRYPTION_KEY in the app server: a private base64 encoding of exactly 32 random bytes, unique to the installation. Losing or changing it prevents decryption of existing secrets. Delivery additionally needs AGENT_WEBHOOK_DELIVERY_ENABLED=true and a deliberately configured protected scheduler; none is installed by the draft. The drain endpoint is POST /api/public/agent-webhook-drain, with x-agent-webhook-job-secret matching the dedicated 64-character hexadecimal secret stored in internal_job_secrets under agent_webhooks. Restrict access and manage the scheduler credential privately. Validate signatures and test delivery only to an endpoint you control. Production delivery is unverified.",
        ],
      },
      {
        heading: "Troubleshooting and rotation",
        paragraphs: [
          "Check which process consumes the variable, restart or redeploy that process securely as appropriate, confirm the project and feature gate, and inspect redacted error codes. Authentication errors can also mean wrong scopes, disabled provider access, callback mismatch, quota or absent review approval. Never print a credential to check it.",
          "Rotate credentials in the provider and secret manager, then verify the intended feature in a test workspace. Plan webhook encryption-key recovery before changing it. Revoke exposed keys promptly and avoid logging secret-bearing request headers.",
        ],
      },
    ],
  },
  {
    slug: "getting-started",
    title: "Getting started",
    description:
      "Understand the proposed AutoSocials agent interfaces and connection flow.",
    sections: [
      {
        heading: "Availability",
        paragraphs: [
          "AutoSocials provides a hosted agent pilot. The deployed API reference and the tools listed by your connection indicate what is available. Client connections and provider delivery have separate verification steps.",
        ],
      },
      {
        heading: "Connect safely",
        paragraphs: [
          "Use an AutoSocials workspace and connect the social accounts you are authorised to manage. A client will need an authorised connection to the workspace before it can read private information. Never paste access tokens into a prompt or public configuration.",
          "Use https://autosocials.com/mcp for the hosted pilot. Complete OAuth in your client and select the workspace you want to grant access to.",
        ],
      },
      {
        heading: "First read",
        paragraphs: [
          "Call list_connected_channels to verify your access. An empty list means there are no connected channels in that workspace. Check the destination account before creating a publishing request.",
        ],
      },
    ],
  },
  {
    slug: "clients",
    title: "Connect an AI client",
    description:
      "Separate guidance for Dot, ChatGPT, Codex, Claude, Gemini and Perplexity.",
    sections: [
      {
        heading: "Dot",
        paragraphs: [
          "Start with Dot if its MCP connection settings support remote servers and the required authentication. Add the server URL https://autosocials.com/mcp, complete any supported authorisation, then inspect the tools exposed. This path has not been verified.",
        ],
      },
      {
        heading: "ChatGPT",
        paragraphs: [
          "If your account offers custom connectors with compatible remote MCP and authentication, configure the server URL in its connector settings. Availability depends on account and product settings; this integration has not been verified.",
        ],
      },
      {
        heading: "Codex",
        paragraphs: [
          "Use your Codex client’s current MCP configuration instructions for a remote server and supported authentication. Do not put secrets in a checked-in configuration file. This connection has not been verified.",
        ],
      },
      {
        heading: "Claude",
        paragraphs: [
          "Use the applicable Claude client’s current remote MCP connector instructions and supported authorisation flow. Client editions differ; this connection has not been verified.",
        ],
      },
      {
        heading: "Gemini CLI",
        paragraphs: [
          "Consult the Gemini CLI MCP configuration documentation for remote transport and authentication support. This connection has not been verified.",
        ],
      },
      {
        heading: "Gemini Enterprise",
        paragraphs: [
          "An administrator should check the current Enterprise connector and policy options for remote MCP. This connection has not been verified.",
        ],
      },
      {
        heading: "Gemini consumer",
        paragraphs: [
          "Consumer Gemini capabilities differ from Gemini CLI and Enterprise. No direct AutoSocials connection is verified; consult Google’s current product documentation.",
        ],
      },
      {
        heading: "Perplexity",
        paragraphs: [
          "Check the current Perplexity product documentation for supported connectors and authentication. No direct AutoSocials connection is verified.",
        ],
      },
    ],
  },
  {
    slug: "reference",
    title: "API and MCP reference",
    description:
      "Find the REST and MCP references for the AutoSocials agent pilot.",
    sections: [
      {
        heading: "OpenAPI",
        paragraphs: [
          "The application exposes its API description at https://autosocials.com/openapi.json. Treat the deployed specification as the source of truth for available routes and schemas.",
        ],
      },
      {
        heading: "Pilot interfaces",
        paragraphs: [
          "Use GET /api/v1/channels (channels:read), GET /api/v1/brand-summary (brand:read), POST /api/v1/written-drafts and POST /api/v1/publication-previews (drafts:write), and GET /api/v1/publication-status (posts:read). Writes require an Idempotency-Key. Written drafts save supplied copy. REST uses workspace API keys. MCP uses OAuth. A workspace owner can grant text-only LinkedIn scheduling (posts:schedule) and a separate Publish now permission (posts:publish). Use the delivery status to confirm publication.",
        ],
      },
      {
        heading: "Research and Organic Winners",
        paragraphs: [
          "The branch offers list_social_research and get_social_research_report with research:read. find_social_research_targets uses research:lookup; metered company lookup requires allowMeteredLookup. start_social_research uses research:run, an idempotency key, explicit allowMeteredRun: true, and at most three exact public profiles; its provider flag defaults off. Provider access and deployed behavior are unverified.",
          "find_organic_winners, list_organic_winner_findings and list_organic_winner_shortlist use winners:read. Ranking uses the existing method on at most the most recent 500 matching saved posts, omits stale evidence and does not sync a provider. Results and deployment remain unverified. The paid ads module has not been built; organic findings do not create or launch ads.",
        ],
      },
      {
        heading: "Responses and discovery",
        paragraphs: [
          "REST success responses wrap results as { requestId, data }; errors use { requestId, error: { code, message } }, and X-Request-Id is returned in the response headers. Channels data has channels and nextCursor; brand summary data has name, website and voice; a written draft returns postId and status. Preview and status data include previewId, state and snapshot; status also includes post and deliveries. The deployed OpenAPI schema is authoritative for complete fields.",
          "The branch also exposes a machine-readable tool catalogue at https://autosocials.com/mcp-tools.json. list_workspace_capabilities (channels:read) describes available tools, browser handoffs and limitations. list_publishing_calendar uses schedule:read; list_organic_content_plans and get_organic_content_plan use planning:read. Check the deployed catalogue and grants for availability.",
        ],
      },
      {
        heading: "Signed webhook events",
        paragraphs: [
          "The branch defines post.scheduled, post.queued, post.published, post.failed and post.held events for signed webhook delivery. Registering a subscription alone does not establish that event production, a worker or delivery is active; these remain unverified. Verify X-AutoSocials-Signature (v1=hex) as HMAC-SHA256 over the exact X-AutoSocials-Timestamp value, a period and the raw request body, using the signing secret. Reject stale timestamps and compare signatures in constant time. X-AutoSocials-Event-Id identifies the event for deduplication.",
        ],
      },
      {
        heading: "Current gaps",
        paragraphs: [
          "Check client support and provider delivery separately. A LinkedIn standing grant covers text posts and the owner's selected accounts, limits and expiry. Use AutoSocials to publish approved media.",
        ],
      },
      {
        heading: "Permissions and errors",
        paragraphs: [
          "Access must remain scoped to the authorised workspace. Follow the deployed specification for authentication, errors, pagination and rate limits; do not assume a successful connection grants permission to publish or change data.",
        ],
      },
    ],
  },
  {
    slug: "tasks",
    title: "Task guides",
    description: "Find connected channels and prepare a safe workflow.",
    sections: [
      {
        heading: "Find connected channels",
        paragraphs: [
          "If these interfaces are deployed and your client is authorised, ask the client to list connected channels using list_connected_channels, or consult the deployed OpenAPI description for GET /api/v1/channels. Verify the returned workspace and channel identities.",
        ],
      },
      {
        heading: "Prepare content",
        paragraphs: [
          "Use the AutoSocials workspace to plan and create content. Check copy, media and the intended account before approving a publish action. Availability of individual agent actions is determined by the deployed tool list.",
        ],
      },
      {
        heading: "Troubleshoot",
        paragraphs: [
          "If no channels appear, verify the selected workspace, account connections, permissions and authorisation. Do not share credentials when requesting help.",
        ],
      },
    ],
  },
  {
    slug: "pricing-and-limits",
    title: "Pricing, limits and support",
    description: "Find current pricing, product limits and help.",
    sections: [
      {
        heading: "Pricing",
        paragraphs: [
          "See https://autosocials.com/pricing for current plans and credit allowances. API or MCP access, quotas and any additional charges are not established by this documentation.",
        ],
      },
      {
        heading: "Limits",
        paragraphs: [
          "Consult the deployed API specification and product for current limits. The paid ads module has not been built. Deleting a post in AutoSocials does not remove it from TikTok.",
        ],
      },
      {
        heading: "Support",
        paragraphs: [
          "Use the support options in your AutoSocials workspace or visit https://autosocials.com. Include the client, time, workspace context and a redacted error; never send tokens or passwords.",
        ],
      },
    ],
  },
  {
    slug: "comparison-postiz",
    title: "AutoSocials and Postiz",
    description: "A dated, qualified comparison of AutoSocials and Postiz.",
    sections: [
      {
        heading: "Comparison — 22 November 2026",
        paragraphs: [
          "AutoSocials describes itself as an AI social growth workspace with planning, content creation, scheduling and learning workflows. Postiz describes a social media scheduling product; consult https://postiz.com for its current features and terms.",
          "This is a high-level comparison, not a feature parity or pricing assessment. AutoSocials agent interfaces described in these docs are branch work and have not been verified live. Verify each product’s current capabilities and pricing before choosing.",
        ],
      },
    ],
  },
  {
    slug: "changelog",
    title: "Developer changelog",
    description:
      "Changes and availability of AutoSocials developer interfaces.",
    sections: [
      {
        heading: "22 November 2026 — public setup guides",
        paragraphs: [
          "Added the self-hosting checklist, provider credential guide and hosted API and MCP references. Client interoperability and the first clean self-hosted installation are tracked separately.",
        ],
      },
    ],
  },
];

export function developerMarkdown() {
  return developerPages
    .map((page) =>
      [
        `## ${page.title}`,
        `URL: https://autosocials.com/developers/${page.slug}`,
        page.description,
        ...(page.slug === "reference"
          ? developerExamples.flatMap((example) => [
              "",
              `### ${example.language} example`,
              "```",
              example.code,
              "```",
            ])
          : []),
        ...page.sections.flatMap((section) => [
          "",
          `### ${section.heading}`,
          ...section.paragraphs.map((paragraph) =>
            section.checklist ? "- [ ] " + paragraph : paragraph,
          ),
        ]),
        "",
      ].join("\n"),
    )
    .join("\n");
}

export function searchDeveloperPages(query: string) {
  const needle = query.trim().toLowerCase();
  return developerPages.filter((item) =>
    `${item.title} ${item.description} ${item.sections.map((section) => `${section.heading} ${section.paragraphs.join(" ")}`).join(" ")}`
      .toLowerCase()
      .includes(needle),
  );
}

// Examples are part of the same corpus as the rendered page and full text index.
export const developerExamples = [
  {
    language: "PowerShell",
    code: '$headers = @{ Authorization = "Bearer $env:AUTOSOCIALS_API_KEY" }\nInvoke-RestMethod -Uri "https://autosocials.com/api/v1/channels" -Headers $headers',
  },
  {
    language: "curl",
    code: 'curl --fail-with-body -H "Authorization: Bearer $AUTOSOCIALS_API_KEY" https://autosocials.com/api/v1/channels',
  },
  {
    language: "JavaScript",
    code: 'const response = await fetch("https://autosocials.com/api/v1/channels", {\n  headers: { Authorization: `Bearer ${process.env.AUTOSOCIALS_API_KEY}` },\n});\nconst result = await response.json();\nif (!response.ok) throw new Error(result.error?.message ?? "Request failed");\nconsole.log(result.data.channels);',
  },
  {
    language: "Python",
    code: 'import os\nimport requests\nresponse = requests.get("https://autosocials.com/api/v1/channels", headers={"Authorization": f"Bearer {os.environ[\'AUTOSOCIALS_API_KEY\']}"}, timeout=30)\nresponse.raise_for_status()\nprint(response.json()["data"]["channels"])',
  },
];
