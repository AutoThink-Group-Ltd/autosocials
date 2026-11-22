
-- Creator profiles table - stores scraped/discovered creators
CREATE TABLE public.creator_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL DEFAULT 'tiktok',
  username TEXT NOT NULL,
  display_name TEXT,
  bio TEXT,
  profile_url TEXT,
  avatar_url TEXT,
  follower_count INTEGER,
  following_count INTEGER,
  engagement_rate NUMERIC(5,2),
  avg_views INTEGER,
  total_likes INTEGER,
  video_count INTEGER,
  location TEXT,
  niches TEXT[] DEFAULT '{}',
  content_themes TEXT[] DEFAULT '{}',
  last_post_at TIMESTAMPTZ,
  last_scraped_at TIMESTAMPTZ DEFAULT now(),
  source_query TEXT,
  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(platform, username)
);

-- Search queries table - tracks what users searched for and caches results
CREATE TABLE public.search_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'tiktok',
  result_count INTEGER DEFAULT 0,
  creator_ids UUID[] DEFAULT '{}',
  searched_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_creator_profiles_platform_username ON public.creator_profiles(platform, username);
CREATE INDEX idx_creator_profiles_niches ON public.creator_profiles USING GIN(niches);
CREATE INDEX idx_creator_profiles_follower_count ON public.creator_profiles(follower_count DESC);
CREATE INDEX idx_creator_profiles_last_scraped ON public.creator_profiles(last_scraped_at DESC);
CREATE INDEX idx_search_queries_query ON public.search_queries(query, platform);

-- RLS - public read for now (no auth yet), will lock down later
ALTER TABLE public.creator_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read of creator profiles" ON public.creator_profiles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert from service role" ON public.creator_profiles FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update from service role" ON public.creator_profiles FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow public read of search queries" ON public.search_queries FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert search queries" ON public.search_queries FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update search queries" ON public.search_queries FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
