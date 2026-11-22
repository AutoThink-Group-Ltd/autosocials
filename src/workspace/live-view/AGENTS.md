# Live View

- Studio blocks (assets, document, shotlist, storyboard, palette, type_specimen, compare, confirm) live in `blocks/`; file ids are filtered to the workspace by `keepOwnFiles`, previews come from `getFilePreviews`, and only a user decision via `respondToConfirm` moves a confirm card — so Sam can never self-approve renders.

- Direct reference-video requests prepare a preview. The user approves the preview and exact supported model settings before production.
