import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/publishing/")({
  beforeLoad: ({ location }) => {
    throw redirect({ href: "/app/schedule" + location.searchStr, replace: true });
  },
});
