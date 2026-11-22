
ALTER TABLE public.creator_profiles 
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS latest_video_url text,
  ADD COLUMN IF NOT EXISTS latest_video_description text;
