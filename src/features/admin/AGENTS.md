# Admin features

- Super Admin "switch into user" goes only through `src/lib/impersonation.functions.ts` (role re-checked server-side, super admins never targetable, every switch logged in `impersonation_events`); the original session is kept in that tab's sessionStorage only.
- Super Admin Brand Identity (`/app/admin/brand`) is read-only: swatches are read live from CSS and only compared against `src/brand/baseline.ts`.
