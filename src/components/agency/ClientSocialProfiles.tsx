import { SocialChannelIcon } from "@/components/agency/SocialChannelIcon";
import type { ClientSocialProfile, SocialPlatform } from "@/lib/client-social-profiles";
import { SOCIAL_PLATFORMS } from "@/lib/client-social-profiles";

export function ClientSocialProfiles({ profiles }: { profiles: ClientSocialProfile[] | null }) {
  if (!Array.isArray(profiles) || profiles.length === 0) return null;
  return <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Client social profiles">
    {profiles.map(({ platform, handle, url }, index) => {
      if (!SOCIAL_PLATFORMS.includes(platform as SocialPlatform) || typeof handle !== "string") return null;
      const content = <><SocialChannelIcon platform={platform as SocialPlatform} className="h-3.5 w-3.5" /><span className="max-w-32 truncate">@{handle}</span></>;
      const className = "inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-xs text-muted-foreground";
      return url && /^https:\/\//i.test(url)
        ? <a key={index} href={url} target="_blank" rel="noopener noreferrer" className={className} aria-label={`${platform} ${handle}`}>{content}</a>
        : <span key={index} className={className} aria-label={`${platform} ${handle}`}>{content}</span>;
    })}
  </div>;
}
