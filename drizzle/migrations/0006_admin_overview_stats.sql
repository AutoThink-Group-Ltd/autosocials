CREATE OR REPLACE FUNCTION public.admin_overview_stats(_days int)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s timestamptz := now() - make_interval(days => _days); p timestamptz := now() - make_interval(days => _days*2); r jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT jsonb_build_object(
    'total_users', (SELECT count(*) FROM auth.users),
    'signups', (SELECT count(*) FROM auth.users WHERE created_at >= s),
    'signups_prev', (SELECT count(*) FROM auth.users WHERE created_at >= p AND created_at < s),
    'workspaces', (SELECT count(*) FROM public.workspaces),
    'active_subs', (SELECT count(*) FROM public.workspace_subscriptions WHERE status IN ('active','trialing')),
    'visitors', (SELECT count(DISTINCT anonymous_id) FROM public.website_page_views WHERE created_at >= s),
    'visitors_prev', (SELECT count(DISTINCT anonymous_id) FROM public.website_page_views WHERE created_at >= p AND created_at < s),
    'pageviews', (SELECT count(*) FROM public.website_page_views WHERE created_at >= s),
    'posts_created', (SELECT count(*) FROM public.posts WHERE created_at >= s),
    'posts_published', (SELECT count(*) FROM public.posts WHERE status = 'published' AND updated_at >= s),
    'searches', (SELECT count(*) FROM public.search_queries WHERE searched_at >= s),
    'emails', (SELECT count(*) FROM public.email_send_log WHERE sent_at >= s),
    'sam_threads', (SELECT count(*) FROM public.agent_threads WHERE created_at >= s),
    'daily', (SELECT coalesce(jsonb_agg(jsonb_build_object('date', to_char(d,'DD/MM'),
        'signups', (SELECT count(*) FROM auth.users u WHERE u.created_at::date = d::date),
        'visitors', (SELECT count(DISTINCT anonymous_id) FROM public.website_page_views w WHERE w.created_at::date = d::date),
        'pageviews', (SELECT count(*) FROM public.website_page_views w WHERE w.created_at::date = d::date)) ORDER BY d), '[]'::jsonb)
      FROM generate_series(date_trunc('day', s), date_trunc('day', now()), interval '1 day') d),
    'top_pages', (SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM (SELECT page_path AS name, count(*) AS value FROM public.website_page_views WHERE created_at >= s GROUP BY 1 ORDER BY 2 DESC LIMIT 8) t),
    'top_sources', (SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM (SELECT coalesce(nullif(utm_source,''), nullif(split_part(split_part(referrer,'://',2),'/',1),''), 'Direct') AS name, count(DISTINCT session_id) AS value FROM public.website_page_views WHERE created_at >= s GROUP BY 1 ORDER BY 2 DESC LIMIT 8) t)
  ) INTO r;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.admin_overview_stats(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_overview_stats(int) TO authenticated;