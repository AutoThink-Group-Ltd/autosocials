import { createFileRoute } from "@tanstack/react-router";
import MessagesPage from "@/pages/app/MessagesPage";

export const Route = createFileRoute("/app/messages")({
  component: MessagesPage,
});
