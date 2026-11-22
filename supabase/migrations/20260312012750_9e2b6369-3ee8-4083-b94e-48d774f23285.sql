
CREATE TABLE public.public_creator_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_profile_id uuid REFERENCES public.creator_profiles(id) ON DELETE CASCADE NOT NULL,
  platform text NOT NULL,
  username text NOT NULL,
  display_name text,
  slug text NOT NULL,
  page_title text,
  meta_description text,
  ai_summary text,
  ai_content_topics text[] DEFAULT '{}'::text[],
  ai_audience_interests text[] DEFAULT '{}'::text[],
  ai_collaboration_notes text,
  status text NOT NULL DEFAULT 'draft',
  review_status text NOT NULL DEFAULT 'needs_review',
  is_indexable boolean DEFAULT true,
  low_data_warning boolean DEFAULT false,
  duplicate_risk boolean DEFAULT false,
  page_views integer DEFAULT 0,
  last_viewed_at timestamptz,
  generated_at timestamptz DEFAULT now(),
  published_at timestamptz,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(platform, username)
);

ALTER TABLE public.public_creator_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view published creator pages"
  ON public.public_creator_pages
  FOR SELECT
  TO anon, authenticated
  USING (status = 'published');

CREATE POLICY "Authenticated can view all creator pages"
  ON public.public_creator_pages
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert creator pages"
  ON public.public_creator_pages
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update creator pages"
  ON public.public_creator_pages
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
