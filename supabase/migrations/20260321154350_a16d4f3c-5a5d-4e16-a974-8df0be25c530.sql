
-- Enable realtime for email tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.email_replies;
ALTER PUBLICATION supabase_realtime ADD TABLE public.email_send_log;
