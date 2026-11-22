CREATE OR REPLACE FUNCTION public.admin_creator_page_stats()
RETURNS TABLE(total bigint, published bigint, needs_review bigint, total_views bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT count(*), count(*) FILTER (WHERE status='published'), count(*) FILTER (WHERE review_status='needs_review'), coalesce(sum(page_views),0)::bigint
  FROM public.public_creator_pages
  WHERE public.has_role(auth.uid(), 'super_admin'::app_role);
$$;
REVOKE ALL ON FUNCTION public.admin_creator_page_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_creator_page_stats() TO authenticated;