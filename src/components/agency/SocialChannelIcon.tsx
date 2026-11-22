import { SiFacebook, SiInstagram, SiLinkedin, SiPinterest, SiReddit, SiSnapchat, SiSubstack, SiThreads, SiTiktok, SiX, SiYoutube } from "react-icons/si";
import type { SocialPlatform } from "@/lib/client-social-profiles";

const icons = { instagram: SiInstagram, facebook: SiFacebook, tiktok: SiTiktok, youtube: SiYoutube, x: SiX, linkedin: SiLinkedin, pinterest: SiPinterest, threads: SiThreads, snapchat: SiSnapchat, substack: SiSubstack, reddit: SiReddit };

export function SocialChannelIcon({ platform, className = "h-5 w-5" }: { platform: SocialPlatform; className?: string }) {
  const Icon = icons[platform];
  return <Icon aria-hidden="true" className={className} />;
}
