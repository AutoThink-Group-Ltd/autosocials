
-- Table: website_page_views
CREATE TABLE public.website_page_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  anonymous_id text NOT NULL,
  page_path text NOT NULL,
  page_title text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  user_agent text,
  screen_width integer,
  screen_height integer,
  language text,
  country text,
  time_on_page_seconds integer NOT NULL DEFAULT 0,
  scroll_depth_max integer NOT NULL DEFAULT 0,
  scroll_depth_25 boolean NOT NULL DEFAULT false,
  scroll_depth_50 boolean NOT NULL DEFAULT false,
  scroll_depth_75 boolean NOT NULL DEFAULT false,
  scroll_depth_100 boolean NOT NULL DEFAULT false,
  engagement_score integer NOT NULL DEFAULT 0,
  is_bounce boolean NOT NULL DEFAULT true,
  is_entry_page boolean NOT NULL DEFAULT false,
  page_load_time_ms integer,
  cta_visible boolean NOT NULL DEFAULT false,
  cta_clicked boolean NOT NULL DEFAULT false,
  rage_clicks integer NOT NULL DEFAULT 0,
  dead_clicks integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Table: website_engagement_events
CREATE TABLE public.website_engagement_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  anonymous_id text NOT NULL,
  page_path text NOT NULL,
  event_type text NOT NULL,
  event_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_wpv_session_id ON public.website_page_views (session_id);
CREATE INDEX idx_wpv_page_path ON public.website_page_views (page_path);
CREATE INDEX idx_wpv_created_at ON public.website_page_views (created_at);
CREATE INDEX idx_wee_session_id ON public.website_engagement_events (session_id);
CREATE INDEX idx_wee_page_path ON public.website_engagement_events (page_path);
CREATE INDEX idx_wee_event_type ON public.website_engagement_events (event_type);
CREATE INDEX idx_wee_created_at ON public.website_engagement_events (created_at);

-- RLS
ALTER TABLE public.website_page_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_engagement_events ENABLE ROW LEVEL SECURITY;

-- Insert policies: anon + authenticated can insert
CREATE POLICY "Anyone can insert page views"
  ON public.website_page_views FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can insert engagement events"
  ON public.website_engagement_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Update policy: anon + authenticated can update (for sendBeacon PATCH)
CREATE POLICY "Anyone can update own page views"
  ON public.website_page_views FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Select policies: only super_admin
CREATE POLICY "Super admins can select page views"
  ON public.website_page_views FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can select engagement events"
  ON public.website_engagement_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));
