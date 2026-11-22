import { createFileRoute } from "@tanstack/react-router";
import AgencyLeadsPage from "@/features/agency/AgencyLeadsPage";

export const Route = createFileRoute("/agency/leads")({ component: AgencyLeadsPage });
