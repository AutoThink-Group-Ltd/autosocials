import { supabase } from '@/integrations/supabase/client';

export type CreatorProfile = {
  id: string;
  platform: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  profile_url: string | null;
  avatar_url: string | null;
  thumbnail_url: string | null;
  latest_video_url: string | null;
  latest_video_description: string | null;
  follower_count: number | null;
  following_count: number | null;
  engagement_rate: number | null;
  avg_views: number | null;
  total_likes: number | null;
  video_count: number | null;
  location: string | null;
  niches: string[];
  content_themes: string[];
  last_post_at: string | null;
  last_scraped_at: string | null;
  source_query: string | null;
  raw_data: any;
  created_at: string;
  updated_at: string;
  contact_email: string | null;
  contact_source: string | null;
  website_url: string | null;
};

type DiscoverResponse = {
  success: boolean;
  error?: string;
  data?: CreatorProfile[];
  meta?: {
    query: string;
    platform: string;
    total_found: number;
    creators_parsed: number;
  };
};

export type FeedItem = {
  url: string;
  thumbnail_url: string | null;
  title: string | null;
  author_name?: string | null;
  embed_html?: string | null;
  thumbnail_width?: number | null;
  thumbnail_height?: number | null;
};

type FeedResponse = {
  success: boolean;
  error?: string;
  data?: FeedItem[];
};

export type PhylloCreator = {
  phyllo_id: string | null;
  platform: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  profile_url: string | null;
  avatar_url: string | null;
  thumbnail_url: string | null;
  follower_count: number | null;
  following_count: number | null;
  engagement_rate: number | null;
  avg_views: number | null;
  total_likes: number | null;
  video_count: number | null;
  location: string | null;
  niches: string[];
  content_themes: string[];
  contact_email: string | null;
  website_url: string | null;
  raw_phyllo?: any;
};

type PhylloSearchResponse = {
  success: boolean;
  error?: string;
  details?: string;
  data?: PhylloCreator[];
  meta?: {
    query: string;
    platform: string;
    total_found: number;
    creators_parsed: number;
    source: string;
    has_more: boolean;
  };
};

export const creatorsApi = {
  /** Primary discovery via Phyllo (250M+ creators) */
  async phylloSearch(
    query: string,
    platform = 'tiktok',
    limit = 20,
    offset = 0,
    filters?: {
      min_followers?: number;
      max_followers?: number;
      min_engagement_rate?: number;
      niches?: string[];
      location?: string;
      sort_by?: string;
      sort_order?: 'asc' | 'desc';
    }
  ): Promise<PhylloSearchResponse> {
    const { data, error } = await supabase.functions.invoke('phyllo-search', {
      body: { query, platform, limit, offset, ...filters },
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return data;
  },

  /** Get detailed profile from Phyllo and save to our DB */
  async phylloProfile(username: string, platform = 'tiktok', phylloId?: string): Promise<{ success: boolean; data?: CreatorProfile; error?: string }> {
    try {
      const { data, error } = await supabase.functions.invoke('phyllo-profile', {
        body: { username, platform, phyllo_id: phylloId },
      });

      if (error) return { success: false, error: String(error?.message || error) };
      return data ?? { success: false, error: 'No data returned' };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Phyllo lookup failed' };
    }
  },

  /** Legacy discover via Firecrawl scraping — used as fallback */
  async discover(query: string, platform = 'tiktok', limit = 20, mode: 'keyword' | 'username' | 'brand' = 'keyword'): Promise<DiscoverResponse> {
    const { data, error } = await supabase.functions.invoke('discover-creators', {
      body: { query, platform, limit, mode },
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return data;
  },

  async fetchFeed(username: string, platform = 'tiktok', limit = 20): Promise<FeedResponse> {
    const { data, error } = await supabase.functions.invoke('fetch-creator-feed', {
      body: { username, platform, limit },
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return data;
  },

  async getCachedCreators(options?: {
    niches?: string[];
    minFollowers?: number;
    platform?: string;
    limit?: number;
  }): Promise<CreatorProfile[]> {
    let q = supabase
      .from('creator_profiles')
      .select('id,platform,username,display_name,bio,profile_url,avatar_url,thumbnail_url,latest_video_url,latest_video_description,follower_count,following_count,engagement_rate,avg_views,total_likes,video_count,location,niches,content_themes,last_post_at,last_scraped_at,source_query,raw_data,created_at,updated_at,contact_email,contact_source,website_url')
      .not('thumbnail_url', 'is', null)
      .order('follower_count', { ascending: false })
      .limit(options?.limit || 50);

    if (options?.platform) {
      q = q.eq('platform', options.platform);
    }
    if (options?.minFollowers) {
      q = q.gte('follower_count', options.minFollowers);
    }
    if (options?.niches?.length) {
      q = q.overlaps('niches', options.niches);
    }

    const { data } = await q;
    return ((data as unknown as CreatorProfile[]) || []).map(c => ({
      ...c,
      niches: c.niches || [],
      content_themes: c.content_themes || [],
    }));
  },

  async getRecentSearches(limit = 10) {
    const { data } = await supabase
      .from('search_queries')
      .select('*')
      .order('searched_at', { ascending: false })
      .limit(limit);
    return data || [];
  },

  async initInstagramOAuth(): Promise<{ success: boolean; authUrl?: string; error?: string }> {
    const { data, error } = await supabase.functions.invoke('instagram-oauth-init');
    if (error) return { success: false, error: error.message };
    return data;
  },

  async getMetaConnectionStatus(): Promise<{ connected: boolean; accounts: any[] }> {
    const { data } = await supabase
      .from('meta_data_sources')
      .select('*')
      .eq('is_connected', true)
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (data && data.length > 0) {
      const source = data[0] as any;
      return {
        connected: true,
        accounts: source.connection_metadata?.ig_accounts || [],
      };
    }
    return { connected: false, accounts: [] };
  },

  async scrapeInstagramCreator(username: string): Promise<{ success: boolean; data?: CreatorProfile; error?: string }> {
    const { data, error } = await supabase.functions.invoke('instagram-scrape-creator', {
      body: { username },
    });
    if (error) return { success: false, error: error.message };
    return data;
  },
};
