import { createFileRoute, redirect } from "@tanstack/react-router";

/** Retired editable brand page — Brand Identity at /app/admin/brand is the one canonical destination. */
export const Route = createFileRoute("/app/admin/brand-guidelines")({
  beforeLoad: () => {
    throw redirect({ to: "/app/admin/brand" });
  },
});
