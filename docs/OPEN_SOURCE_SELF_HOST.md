# Self-hosting AutoSocials

Continuous integration verified the migration history in a clean Supabase stack, container startup and a synthetic sign-in. Set up your own Supabase instance and enable only the integrations you can verify. Use the [API key setup guide](https://autosocials.com/developers/api-key-setup) to check optional providers.

Use an independently operated Supabase project or existing compatible Supabase stack; this Compose file runs only the application and does not deploy or configure Supabase. Review `supabase/config.toml`, migrations, edge functions, auth redirect URLs, storage buckets, RLS, scheduled jobs and webhook ownership before applying anything. Migrations may be environment-specific or destructive: back up and review individually; do not point a test install at production. Run `node release/prepare-migrations.mjs` from a clean exported source tree to assemble both migration histories and the four replacement migrations. Review the resulting order before applying it to your installation. Configure functions and secrets using Supabase's supported tooling. A public client key is not a service-role key; keep the latter server-side.

Copy `release/env.example` to `release/self-host.env` outside version control and fill values from the isolated project. From the source root of a reviewed snapshot, `docker compose --env-file release/self-host.env -f release/compose.yml up --build` builds and binds localhost only. Never expose the service role key via VITE_ variables. Use TLS and a configured reverse proxy before public exposure.

## Services and optional capabilities

- Supabase: database, Auth, Storage and deployed edge functions; app and edge-function secrets must refer to the same intended project.
- OpenAI: model features; configure an operator-owned key in the relevant server/functions environment.
- AutoToast: video rendering; requires an independently available compatible service and credentials. Video may be unavailable without it.
- SendGrid: branded signup and system mail; requires its own configured sender and key.
- Stripe: billing/webhooks; leave disabled unless configured and independently tested. Do not reuse production webhooks.
- Google OAuth, Shutterstock and other social/provider integrations: separate provider credentials, redirects, scopes and agreements; features may be unavailable without them.

Check the source for feature-specific settings and disable delivery, payments and scheduled jobs unless deliberately configured. This list is indicative, not an exhaustive environment contract.

## Upgrade and recovery

Back up database and storage, record the running release and secrets separately, inspect the release notes and migration diff, test on an isolated clone, then apply approved migrations and deploy the matching application and functions. Confirm RLS, auth, storage and provider callbacks. Restore from tested backups if rollback of a data migration is not safe; rolling back a container alone does not undo database changes.

Compose interpolates the public VITE variables at build time from `--env-file`; changing them requires rebuilding. Runtime server authentication uses `SUPABASE_PUBLISHABLE_KEY` as well as `SUPABASE_URL`, while administrative server code uses `SUPABASE_SERVICE_ROLE_KEY`. The Supabase example configuration is a template only: copy it to `supabase/config.toml`, change the project ID, and review every function JWT setting before deployment. Build context filtering excludes env files and common private-key extensions, but a reviewed snapshot is still required.

## Agent API and webhook controls

The example disables the agent API, draft operations, publishing, tile planning and research-provider operations. `AUTOSOCIALS_AGENT_API_ENABLED=1` enables the API; `AUTOSOCIALS_AGENT_DRAFTS_ENABLED=1` separately enables draft operations. Publishing and tile planning additionally require their respective `AUTOSOCIALS_AGENT_PUBLISHING_ENABLED=1` or `AUTOSOCIALS_AGENT_TILE_PLANNING_ENABLED=1`, with the API and drafts enabled. Configure `AUTOSOCIALS_AGENT_ORIGIN` to the installation's canonical HTTPS origin before enabling; the example uses a nonfunctional placeholder. `AUTOSOCIALS_AGENT_ALLOWED_ORIGINS` is an optional comma-separated list of trusted browser origins, in addition to the configured origin.

Research provider calls require `AUTOSOCIALS_AGENT_RESEARCH_PROVIDER_ENABLED=1` and the corresponding agent scope and explicit metered consent. Virlo also requires an operator to set `VIRLO_ENABLED` to a value other than `false` and configure `VIRLO_API_KEY`; the example leaves it off. Apify and Firecrawl credentials are separately configured in the app server environment as needed. Research execution can incur provider charges.

Webhook delivery is independently disabled unless `AGENT_WEBHOOK_DELIVERY_ENABLED=true`. Subscription encryption requires an independently generated and privately stored base64 encoding of exactly 32 random bytes in `AGENT_WEBHOOK_ENCRYPTION_KEY`; losing or changing this key prevents decryption of existing subscription secrets. A deliberately configured scheduler must call the protected drain endpoint with its dedicated job secret; the source release does not install a webhook scheduler. Review the agent migrations, access controls, recipient endpoints and retry behavior before enabling.

The migration preparation script copies the three worker replacements that omit installation-specific scheduler targets while preserving schema and grants. Review them and test on an isolated database. Set `LINKEDIN_OAUTH_APP_ORIGIN` in the LinkedIn edge-function environment to the installation’s exact HTTPS app origin, and register that installation’s Supabase callback with LinkedIn. X and LinkedIn edge callbacks derive from the installation’s `SUPABASE_URL`. Verify both provider flows and job ownership before enabling them.

## Preparing the exported source tree

Copy `release/supabase-config.example.toml` to `supabase/config.toml` and set your own project ID. Run `node release/prepare-migrations.mjs` to order the older Drizzle SQL and the replacement files alongside the Supabase migrations. Review the assembled SQL and apply it only to your intended database. Configure the Supabase edge functions and their secrets separately from `release/self-host.env`. Automated winner sync, outreach and the GSC digest need their own scheduler configuration.

## Background workers

The exported SQL reads the following optional URLs from Supabase Vault. Use the exact HTTPS URL on your own installation. Workers for these routes skip HTTP delivery until their corresponding URL is set. Review the matching endpoint authentication and job state before enabling a cron entry, and use a test workspace to verify it.

| Vault name | Path on your app |
| --- | --- |
| `creative_jobs_url` | `/api/public/creative-jobs` |
| `brand_dna_jobs_url` | `/api/public/creative-jobs?lane=brand-dna` |
| `schedule_confirmations_url` | `/api/public/schedule-confirmations` |
| `publish_notifications_url` | `/api/public/publish-notifications` |

The scheduled publisher has its own `publish_worker_url` and `publish_cron_secret` Vault entries. Its URL points to the installation's own `publish-scheduled-posts` edge function, where the server must have the matching `PUBLISH_CRON_SECRET`. Some database-only maintenance jobs are installed by the migrations.

Internal email alerts in the exported app use operator-owned addresses. Set `SELF_HOST_CREATIVE_ALERT_TO` to receive optional creative and quota alerts. Set `SELF_HOST_REPORTS_FROM` and the matching `SELF_HOST_GSC_DIGEST_TO` or `SELF_HOST_SEO_AUDIT_TO` before enabling report email. Use a sender verified in your own SendGrid account.

The export creates the role and workspace schema without seeding hosted users, administrator grants, workspace memberships or the hosted SEO roadmap. Create the first account in your own Auth instance before granting it any administrator role. Use a trusted database administrator session to grant the role to that exact Auth user ID, and verify the account in the admin UI.
