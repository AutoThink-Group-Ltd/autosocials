# AutoSocials

**Turn research and brand knowledge into social content you can actually publish.**

AutoSocials is an AI social content workspace for marketers and agencies. Use audience and trend research to pick an angle, give it your brand's voice, then build the post, carousel or video around a clear idea. Connect compatible AI clients over MCP to work with your AutoSocials workspace.

[Start with AutoSocials Cloud](https://autosocials.com/auth) · [Compare monthly credit plans](https://autosocials.com/pricing) · [Self-host AutoSocials](docs/OPEN_SOURCE_SELF_HOST.md)

## What you can make

- **LinkedIn carousels** — shape one argument across a sequence of slides, review the deck and export a PDF for LinkedIn.
- **Social tiles** — turn a message into a branded graphic. Review the copy, visual direction and references before approving image generation.
- **Motion graphics and whiteboard explainers** — build from a brief, storyboard and narration. On Cloud, available video formats include HyperFrames motion graphics and whiteboard-style videos, subject to the selected engine and its availability.
- **Research you can use** — use Sam, Brand DNA and Organic Winners to turn audience questions and promising formats into ideas that fit your brand.

## AutoSocials Cloud vs open source

Choose Cloud to get straight to making content with managed hosting and configured production providers. Choose open source to run and customise the application on infrastructure you control.

| | AutoSocials Cloud | Open source and self-hosted |
| --- | --- | --- |
| Getting started | Open an account and work in the hosted app. Connect your social accounts where supported. | Deploy the app, configure Supabase, run migrations and set up your environment. |
| Production and credits | Choose a monthly credit plan. Estimates vary by engine and settings, and eligible jobs use your AutoSocials credit balance. | Supply the API keys for the features you enable. Provider accounts, usage charges and any required subscriptions are managed and paid for separately. |
| Social publishing | Connect to available Cloud integrations. Formats vary by channel, account and permissions. | Set up the developer credentials, OAuth redirects and scopes for the providers you use. Some platforms may require app review. |
| AI agents | Use the hosted MCP endpoint and grant scoped access to a workspace. The tool catalogue shows the current pilot capabilities. | Point your compatible MCP client at your deployment and configure its authentication and the providers it needs. |
| Operations and control | AutoSocials operates and updates the hosted application. | You control the deployment and the source. You run upgrades, backups and maintenance, and manage the third-party services you connect. |

Start with the [Cloud credit plans](https://autosocials.com/pricing), or follow the [self-hosting setup](docs/OPEN_SOURCE_SELF_HOST.md) and [provider key guide](https://autosocials.com/developers/api-key-setup). The open-source release was checked with a clean Supabase database, the app container and a synthetic sign-in. Feature availability depends on the release, credentials and configuration. See the [agent capability matrix](docs/AGENT_CAPABILITY_MATRIX.md) and [live MCP catalogue](https://autosocials.com/mcp-tools.json).

See how the workflow compares with Postiz, including a worked carousel, social tile and video brief. [Postiz vs AutoSocials](https://autosocials.com/compare/postiz-vs-autosocials)

## Built by a marketer

AutoSocials was built by Kasim Javed, a seasoned marketer who runs Creative Marketing, a multi-million-pound agency. It is designed and maintained around the work agencies do every week, from researching an idea and shaping the message to reviewing creative and getting it ready to publish. [Kasim Javed on LinkedIn](https://www.linkedin.com/in/kasimjaved/)

## Licence

AutoSocials source in this repository is licensed under [GNU AGPL v3.0 only](LICENSE). Third-party components retain their own licences. See [third-party notices](THIRD_PARTY_NOTICES.md), [contributing](CONTRIBUTING.md) and the [security policy](SECURITY.md).
