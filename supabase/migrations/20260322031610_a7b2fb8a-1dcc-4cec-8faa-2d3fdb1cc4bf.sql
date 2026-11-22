ALTER TABLE public.workspaces ADD COLUMN bcc_on_outreach boolean NOT NULL DEFAULT false;
ALTER TABLE public.workspaces ADD COLUMN bcc_outreach_email text;