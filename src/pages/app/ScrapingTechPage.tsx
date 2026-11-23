import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const ScrapingTechPage = () => {
  return (
    <div className="container max-w-5xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Scraping Tech Documentation</h1>
        <p className="text-muted-foreground mt-1">
          Internal reference for how creator data is sourced across platforms.
        </p>
      </div>

      <Tabs defaultValue="tiktok" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="tiktok">TikTok</TabsTrigger>
          <TabsTrigger value="instagram">Instagram</TabsTrigger>
        </TabsList>

        {/* ─── TIKTOK TAB ─── */}
        <TabsContent value="tiktok" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Creator Discovery
                <Badge variant="outline">discover-creators</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-relaxed">
              <p>
                Discovery runs via the <code className="bg-muted px-1 rounded">discover-creators</code> edge function.
                It parallelises across three sources and deduplicates by username (prioritising profiles with follower stats).
              </p>
              <ol className="list-decimal pl-5 space-y-2">
                <li>
                  <strong>Phyllo API</strong> – Primary structured source. Queries <code className="bg-muted px-1 rounded">phyllo-search</code> with expanded keyword variants and high limits.
                  Returns follower counts, engagement, avatar, bio, etc.
                </li>
                <li>
                  <strong>Local DB cache</strong> – Searches <code className="bg-muted px-1 rounded">creator_profiles</code> for previously-scraped TikTok creators matching the query/niche.
                </li>
                <li>
                  <strong>Firecrawl web search</strong> – Google search via <code className="bg-muted px-1 rounded">api.firecrawl.dev/v2/search</code> for <code className="bg-muted px-1 rounded">site:tiktok.com "@username"</code>.
                  Parses follower/like counts from result snippets using regex.
                </li>
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Profile Enrichment
                <Badge variant="outline">enrich-creator</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-relaxed">
              <p>
                When a creator profile is opened, the <code className="bg-muted px-1 rounded">enrich-creator</code> function runs to backfill missing data.
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Phyllo profile lookup</strong> – Calls <code className="bg-muted px-1 rounded">phyllo-profile</code> by username for structured data (followers, likes, bio, avatar).
                </li>
                <li>
                  <strong>TikTok oEmbed API</strong> – <code className="bg-muted px-1 rounded">https://www.tiktok.com/oembed?url=...</code> used as a fast fallback for avatar and display name when Phyllo data is incomplete.
                </li>
                <li>
                  <strong>Direct HTML scrape</strong> – Fetches <code className="bg-muted px-1 rounded">https://www.tiktok.com/@username</code> and extracts the <code className="bg-muted px-1 rounded">__UNIVERSAL_DATA_FOR_REHYDRATION__</code> JSON script tag for accurate follower/like counts.
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Content Feed
                <Badge variant="outline">fetch-creator-feed</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-relaxed">
              <p>
                The feed (grid of video thumbnails on the creator profile page) is populated by <code className="bg-muted px-1 rounded">fetch-creator-feed</code>.
              </p>
              <h4 className="font-semibold mt-2">Step 1 – Collect video URLs</h4>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Pull previously-stored <code className="bg-muted px-1 rounded">raw_data.video_links</code> from the DB.</li>
                <li>Fetch <code className="bg-muted px-1 rounded">https://www.tiktok.com/embed/@username</code> — an embed profile page that exposes an <code className="bg-muted px-1 rounded">itemList</code> JSON array of video IDs. Extract video URLs from the HTML using regex.</li>
                <li>If still under the requested limit, use <strong>Firecrawl</strong> to scrape the full TikTok profile page (<code className="bg-muted px-1 rounded">waitFor: 5000ms</code>) and extract video links from the markdown.</li>
                <li>If still under limit, run Google searches via Firecrawl: <code className="bg-muted px-1 rounded">site:tiktok.com/@username video</code>.</li>
              </ol>

              <h4 className="font-semibold mt-4">Step 2 – Get thumbnails via oEmbed</h4>
              <p>
                Each video URL is passed to <code className="bg-muted px-1 rounded">https://www.tiktok.com/oembed?url=VIDEO_URL</code> in batches of 5.
                Returns: <code className="bg-muted px-1 rounded">thumbnail_url</code>, <code className="bg-muted px-1 rounded">title</code>, <code className="bg-muted px-1 rounded">author_name</code>, <code className="bg-muted px-1 rounded">embed_html</code>.
              </p>
              <p className="text-muted-foreground">
                TikTok oEmbed thumbnails are stable CDN URLs that do not expire.
              </p>

              <h4 className="font-semibold mt-4">Step 3 – Persist</h4>
              <p>
                Newly discovered video URLs are saved back to <code className="bg-muted px-1 rounded">creator_profiles.raw_data.video_links</code> (max 50) so subsequent loads are instant.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Batch Resync
                <Badge variant="outline">batch-resync-creators</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-relaxed">
              <p>
                Used from admin to backfill stats for creators missing follower counts.
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Processes in sequential batches of 5–10.</li>
                <li>For each creator, fetches the TikTok profile HTML and extracts stats from the <code className="bg-muted px-1 rounded">__UNIVERSAL_DATA_FOR_REHYDRATION__</code> JSON.</li>
                <li>Falls back to TikTok oEmbed API for avatar/display name.</li>
                <li>Updates <code className="bg-muted px-1 rounded">creator_profiles</code> with follower_count, total_likes, avatar_url, display_name.</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Key APIs & Secrets</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="font-medium">TikTok oEmbed</p>
                  <p className="text-muted-foreground">No API key required. Public endpoint.</p>
                  <code className="text-xs bg-muted px-1 rounded block">https://www.tiktok.com/oembed?url=...</code>
                </div>
                <div className="space-y-1">
                  <p className="font-medium">Phyllo API</p>
                  <p className="text-muted-foreground">Secrets: <code className="bg-muted px-1 rounded">PHYLLO_API_KEY</code>, <code className="bg-muted px-1 rounded">PHYLLO_SECRET_KEY</code></p>
                </div>
                <div className="space-y-1">
                  <p className="font-medium">Firecrawl</p>
                  <p className="text-muted-foreground">Secret: <code className="bg-muted px-1 rounded">FIRECRAWL_API_KEY</code></p>
                  <p className="text-muted-foreground">Used for web search + profile page scraping.</p>
                </div>
                <div className="space-y-1">
                  <p className="font-medium">TikTok Embed Profile</p>
                  <p className="text-muted-foreground">No key. Fetches <code className="bg-muted px-1 rounded">/embed/@username</code> HTML.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── INSTAGRAM TAB ─── */}
        <TabsContent value="instagram" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Creator Discovery
                <Badge variant="outline">instagram-scrape-creator</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-relaxed">
              <p>
                Instagram creators are discovered via the <code className="bg-muted px-1 rounded">instagram-scrape-creator</code> edge function, which tries two methods in order:
              </p>
              <ol className="list-decimal pl-5 space-y-3">
                <li>
                  <strong>Meta Graph API (Business Discovery)</strong>
                  <p className="text-muted-foreground mt-1">
                    Uses a connected Instagram Business account's token from <code className="bg-muted px-1 rounded">meta_data_sources</code> table.
                    Calls <code className="bg-muted px-1 rounded">business_discovery.fields(...).username(TARGET)</code> on the Graph API v18.0.
                    Returns: username, name, biography, profile picture, followers, following, media count, and up to 12 recent media items with like/comment counts.
                  </p>
                  <p className="text-muted-foreground mt-1">
                    Engagement rate is calculated as <code className="bg-muted px-1 rounded">(avg likes + comments) / followers × 100</code>.
                    Niches are extracted from bio + captions using keyword matching.
                  </p>
                </li>
                <li>
                  <strong>Firecrawl Fallback</strong>
                  <p className="text-muted-foreground mt-1">
                    If Graph API fails (non-business account, rate limit), falls back to Firecrawl:
                  </p>
                  <ul className="list-disc pl-5 mt-1 space-y-1">
                    <li>Direct scrape of <code className="bg-muted px-1 rounded">instagram.com/username/</code> – extracts <code className="bg-muted px-1 rounded">og:image</code> (profile pic), <code className="bg-muted px-1 rounded">og:title</code> (display name), <code className="bg-muted px-1 rounded">og:description</code> (bio + follower stats).</li>
                    <li>Regex parsing of follower/following/post counts from metadata description (handles K/M/B suffixes).</li>
                    <li>Extracts reel/post links from the scraped markdown.</li>
                    <li>Google search fallback via <code className="bg-muted px-1 rounded">Firecrawl search</code> for <code className="bg-muted px-1 rounded">"username" instagram followers</code> to fill remaining gaps.</li>
                  </ul>
                </li>
              </ol>
              <p className="text-muted-foreground">
                After scraping, the creator is upserted to <code className="bg-muted px-1 rounded">creator_profiles</code> (conflict on <code className="bg-muted px-1 rounded">platform, username</code>) and a public SEO page is auto-generated via <code className="bg-muted px-1 rounded">generate-creator-page</code>.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Content Feed
                <Badge variant="outline">fetch-creator-feed</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-relaxed">
              <h4 className="font-semibold">Step 1 – Collect post URLs</h4>
              <ol className="list-decimal pl-5 space-y-2">
                <li>
                  <strong>Instagram Public Profile API</strong> – Calls <code className="bg-muted px-1 rounded">i.instagram.com/api/v1/users/web_profile_info/</code> with app ID header <code className="bg-muted px-1 rounded">936619743392459</code>.
                  Returns <code className="bg-muted px-1 rounded">edge_owner_to_timeline_media.edges</code> with shortcodes, display URLs, and captions.
                  Also extracts <code className="bg-muted px-1 rounded">profile_pic_url_hd</code> for the avatar.
                </li>
                <li>
                  Pull stored <code className="bg-muted px-1 rounded">raw_data.video_links</code> and <code className="bg-muted px-1 rounded">raw_data.recent_media</code> from DB.
                </li>
                <li>
                  If under limit, <strong>Firecrawl direct scrape</strong> of <code className="bg-muted px-1 rounded">instagram.com/username/</code> to extract reel/post links from markdown.
                </li>
                <li>
                  If still under limit, <strong>Firecrawl Google search</strong> for <code className="bg-muted px-1 rounded">site:instagram.com/username/reel</code> and <code className="bg-muted px-1 rounded">site:instagram.com/username/p/</code>.
                </li>
              </ol>

              <h4 className="font-semibold mt-4">Step 2 – Get thumbnails</h4>
              <p>Two strategies, tried in priority order:</p>
              <ol className="list-decimal pl-5 space-y-2">
                <li>
                  <strong>Meta Instagram oEmbed API</strong> (preferred) – Uses <code className="bg-muted px-1 rounded">META_APP_ID</code> + <code className="bg-muted px-1 rounded">META_APP_SECRET</code> app token.
                  Calls <code className="bg-muted px-1 rounded">graph.facebook.com/v21.0/instagram_oembed?url=POST_URL&fields=thumbnail_url,title,author_name</code>.
                  <Badge className="ml-2" variant="secondary">Stable, non-expiring URLs</Badge>
                </li>
                <li>
                  <strong>Firecrawl fallback</strong> – If Meta secrets not configured, scrapes each post URL individually and extracts <code className="bg-muted px-1 rounded">og:image</code> from metadata.
                  <Badge className="ml-2" variant="outline">CDN URLs may expire</Badge>
                </li>
              </ol>

              <h4 className="font-semibold mt-4">Step 3 – Avatar refresh</h4>
              <p>
                On every feed refresh, the <code className="bg-muted px-1 rounded">avatar_url</code> and <code className="bg-muted px-1 rounded">thumbnail_url</code> are updated in the DB from the Instagram Public Profile API response.
                The frontend also re-fetches the profile after feed load to sync the UI.
              </p>

              <h4 className="font-semibold mt-4">Frontend avatar fallback chain</h4>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Primary: <code className="bg-muted px-1 rounded">creator.avatar_url</code> from DB (CDN URL)</li>
                <li>Fallback: <code className="bg-muted px-1 rounded">unavatar.io/instagram/USERNAME</code></li>
                <li>Final: Gradient circle with user initials</li>
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Cross-Platform Linking
                <Badge variant="outline">Auto-detection</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-relaxed">
              <p>
                When a TikTok creator's profile is opened, the system checks if an Instagram account with the same username exists.
                If not, it triggers <code className="bg-muted px-1 rounded">instagram-scrape-creator</code> in the background.
                Matched profiles appear as "Other Profiles" on the creator page, allowing one-click navigation.
              </p>
              <p>The reverse also applies – viewing an Instagram profile triggers a TikTok lookup via Phyllo.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Key APIs & Secrets</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="font-medium">Meta Graph API (Business Discovery)</p>
                  <p className="text-muted-foreground">Uses token from <code className="bg-muted px-1 rounded">meta_data_sources</code> table (connected IG Business account).</p>
                </div>
                <div className="space-y-1">
                  <p className="font-medium">Meta Instagram oEmbed</p>
                  <p className="text-muted-foreground">Secrets: <code className="bg-muted px-1 rounded">META_APP_ID</code>, <code className="bg-muted px-1 rounded">META_APP_SECRET</code></p>
                  <p className="text-muted-foreground">Requires "oEmbed Read" use case enabled in Meta app.</p>
                </div>
                <div className="space-y-1">
                  <p className="font-medium">Instagram Public Profile API</p>
                  <p className="text-muted-foreground">No secret. Uses hardcoded app ID <code className="bg-muted px-1 rounded">936619743392459</code> in header.</p>
                  <code className="text-xs bg-muted px-1 rounded block">i.instagram.com/api/v1/users/web_profile_info/</code>
                </div>
                <div className="space-y-1">
                  <p className="font-medium">Firecrawl</p>
                  <p className="text-muted-foreground">Secret: <code className="bg-muted px-1 rounded">FIRECRAWL_API_KEY</code></p>
                  <p className="text-muted-foreground">Fallback scraping + Google search.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>URL Normalization</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <p>
                All Instagram post/reel URLs are normalized before deduplication:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Strip query strings and hash fragments</li>
                <li>Remove trailing slashes</li>
                <li>Unescape backslash-encoded forward slashes (<code className="bg-muted px-1 rounded">\/</code> → <code className="bg-muted px-1 rounded">/</code>)</li>
                <li>Ensure <code className="bg-muted px-1 rounded">https://www.instagram.com</code> prefix</li>
              </ul>
              <p className="text-muted-foreground mt-2">
                Regex patterns match both <code className="bg-muted px-1 rounded">/p/SHORTCODE</code> (photos) and <code className="bg-muted px-1 rounded">/reel/SHORTCODE</code> (reels/videos).
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Separator />

      <Card>
        <CardHeader><CardTitle>Architecture Overview</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-3">
          <div className="grid grid-cols-3 gap-4">
            <div className="border rounded-lg p-3 space-y-1">
              <p className="font-semibold">Edge Functions</p>
              <ul className="text-muted-foreground space-y-0.5 text-xs">
                <li>• discover-creators</li>
                <li>• enrich-creator</li>
                <li>• fetch-creator-feed</li>
                <li>• instagram-scrape-creator</li>
                <li>• batch-resync-creators</li>
                <li>• phyllo-search / phyllo-profile</li>
                <li>• generate-creator-page</li>
              </ul>
            </div>
            <div className="border rounded-lg p-3 space-y-1">
              <p className="font-semibold">External APIs</p>
              <ul className="text-muted-foreground space-y-0.5 text-xs">
                <li>• TikTok oEmbed (public)</li>
                <li>• TikTok Embed Profile (public)</li>
                <li>• Meta Graph API v18/v21</li>
                <li>• Instagram Public Profile API</li>
                <li>• Phyllo Search/Profile API</li>
                <li>• Firecrawl Scrape/Search</li>
              </ul>
            </div>
            <div className="border rounded-lg p-3 space-y-1">
              <p className="font-semibold">Database</p>
              <ul className="text-muted-foreground space-y-0.5 text-xs">
                <li>• creator_profiles (core table)</li>
                <li>• meta_data_sources (IG tokens)</li>
                <li>• public_creator_pages (SEO)</li>
                <li>• search_queries (history)</li>
                <li>• list_members (saved lists)</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ScrapingTechPage;
