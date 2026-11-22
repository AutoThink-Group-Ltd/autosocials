/**
 * Custom branded icons for AutoSocials.
 * Each icon is a unique mini-illustration using brand gradients
 * instead of generic outline icons.
 */

const iconBase = "w-full h-full";

export const BrandIconSearch = ({ className = "w-10 h-10" }: { className?: string }) => (
  <svg viewBox="0 0 40 40" fill="none" className={className}>
    <rect width="40" height="40" rx="12" fill="url(#search-bg)" />
    <circle cx="18" cy="17" r="7" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M23 22L28 27" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="18" cy="17" r="3" fill="white" fillOpacity="0.3" />
    <defs>
      <linearGradient id="search-bg" x1="0" y1="0" x2="40" y2="40">
        <stop stopColor="hsl(330, 80%, 55%)" />
        <stop offset="1" stopColor="hsl(280, 60%, 55%)" />
      </linearGradient>
    </defs>
  </svg>
);

export const BrandIconScatter = ({ className = "w-10 h-10" }: { className?: string }) => (
  <svg viewBox="0 0 40 40" fill="none" className={className}>
    <rect width="40" height="40" rx="12" fill="url(#scatter-bg)" />
    <rect x="8" y="12" width="10" height="7" rx="2" fill="white" fillOpacity="0.9" />
    <rect x="22" y="8" width="10" height="7" rx="2" fill="white" fillOpacity="0.5" />
    <rect x="14" y="23" width="10" height="7" rx="2" fill="white" fillOpacity="0.7" />
    <path d="M18 15.5L22 11.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2" />
    <path d="M19 26.5L27 14" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2" />
    <defs>
      <linearGradient id="scatter-bg" x1="0" y1="0" x2="40" y2="40">
        <stop stopColor="hsl(350, 75%, 55%)" />
        <stop offset="1" stopColor="hsl(330, 80%, 50%)" />
      </linearGradient>
    </defs>
  </svg>
);

export const BrandIconBlind = ({ className = "w-10 h-10" }: { className?: string }) => (
  <svg viewBox="0 0 40 40" fill="none" className={className}>
    <rect width="40" height="40" rx="12" fill="url(#blind-bg)" />
    <rect x="9" y="11" width="22" height="4" rx="2" fill="white" fillOpacity="0.9" />
    <rect x="9" y="18" width="16" height="4" rx="2" fill="white" fillOpacity="0.5" />
    <rect x="9" y="25" width="10" height="4" rx="2" fill="white" fillOpacity="0.3" />
    <circle cx="29" cy="27" r="4" fill="white" fillOpacity="0.8" />
    <path d="M28 27L29.5 28.5" stroke="hsl(280, 60%, 55%)" strokeWidth="1.5" strokeLinecap="round" />
    <defs>
      <linearGradient id="blind-bg" x1="0" y1="0" x2="40" y2="40">
        <stop stopColor="hsl(260, 60%, 55%)" />
        <stop offset="1" stopColor="hsl(290, 55%, 50%)" />
      </linearGradient>
    </defs>
  </svg>
);

export const BrandIconLeak = ({ className = "w-10 h-10" }: { className?: string }) => (
  <svg viewBox="0 0 40 40" fill="none" className={className}>
    <rect width="40" height="40" rx="12" fill="url(#leak-bg)" />
    <path d="M12 14L20 10L28 14V22L20 30L12 22V14Z" stroke="white" strokeWidth="2" fill="white" fillOpacity="0.15" />
    <circle cx="20" cy="18" r="3" fill="white" fillOpacity="0.8" />
    <path d="M20 21V26" stroke="white" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 2" />
    <defs>
      <linearGradient id="leak-bg" x1="0" y1="0" x2="40" y2="40">
        <stop stopColor="hsl(35, 80%, 55%)" />
        <stop offset="1" stopColor="hsl(15, 75%, 50%)" />
      </linearGradient>
    </defs>
  </svg>
);

// Solution section icons
export const BrandIconDiscover = ({ className = "w-10 h-10" }: { className?: string }) => (
  <svg viewBox="0 0 40 40" fill="none" className={className}>
    <rect width="40" height="40" rx="12" fill="url(#discover-bg)" />
    <circle cx="15" cy="16" r="5" fill="white" fillOpacity="0.9" />
    <circle cx="25" cy="14" r="4" fill="white" fillOpacity="0.6" />
    <circle cx="20" cy="24" r="4.5" fill="white" fillOpacity="0.75" />
    <path d="M15 21L20 19.5" stroke="white" strokeWidth="1" strokeLinecap="round" />
    <path d="M25 18L20 19.5" stroke="white" strokeWidth="1" strokeLinecap="round" />
    <defs>
      <linearGradient id="discover-bg" x1="0" y1="0" x2="40" y2="40">
        <stop stopColor="hsl(330, 80%, 55%)" />
        <stop offset="1" stopColor="hsl(300, 60%, 50%)" />
      </linearGradient>
    </defs>
  </svg>
);

export const BrandIconOutreach = ({ className = "w-10 h-10" }: { className?: string }) => (
  <svg viewBox="0 0 40 40" fill="none" className={className}>
    <rect width="40" height="40" rx="12" fill="url(#outreach-bg)" />
    <path d="M10 14L20 20L30 14" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="10" y="14" width="20" height="14" rx="2" stroke="white" strokeWidth="2" fill="white" fillOpacity="0.1" />
    <path d="M26 10L30 14" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M22 10L26 14" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
    <defs>
      <linearGradient id="outreach-bg" x1="0" y1="0" x2="40" y2="40">
        <stop stopColor="hsl(260, 65%, 55%)" />
        <stop offset="1" stopColor="hsl(280, 60%, 50%)" />
      </linearGradient>
    </defs>
  </svg>
);

export const BrandIconCollaborate = ({ className = "w-10 h-10" }: { className?: string }) => (
  <svg viewBox="0 0 40 40" fill="none" className={className}>
    <rect width="40" height="40" rx="12" fill="url(#collab-bg)" />
    <circle cx="14" cy="20" r="5" stroke="white" strokeWidth="2" fill="white" fillOpacity="0.2" />
    <circle cx="26" cy="20" r="5" stroke="white" strokeWidth="2" fill="white" fillOpacity="0.2" />
    <path d="M19 20A7 7 0 0 0 21 20" stroke="white" strokeWidth="2" fill="white" fillOpacity="0.4" />
    <path d="M17 16L23 16" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
    <path d="M17 24L23 24" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
    <defs>
      <linearGradient id="collab-bg" x1="0" y1="0" x2="40" y2="40">
        <stop stopColor="hsl(160, 60%, 45%)" />
        <stop offset="1" stopColor="hsl(180, 55%, 40%)" />
      </linearGradient>
    </defs>
  </svg>
);

// AI Features icons
export const BrandIconAIMatch = ({ className = "w-10 h-10" }: { className?: string }) => (
  <svg viewBox="0 0 44 44" fill="none" className={className}>
    <rect width="44" height="44" rx="14" fill="url(#aimatch-bg)" />
    <path d="M22 10L26 18H18L22 10Z" fill="white" fillOpacity="0.8" />
    <circle cx="14" cy="28" r="4" fill="white" fillOpacity="0.6" />
    <circle cx="30" cy="28" r="4" fill="white" fillOpacity="0.6" />
    <path d="M22 18V24" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M18 26L22 24L26 26" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <defs>
      <linearGradient id="aimatch-bg" x1="0" y1="0" x2="44" y2="44">
        <stop stopColor="hsl(330, 80%, 55%)" />
        <stop offset="1" stopColor="hsl(280, 60%, 55%)" />
      </linearGradient>
    </defs>
  </svg>
);

export const BrandIconBrief = ({ className = "w-10 h-10" }: { className?: string }) => (
  <svg viewBox="0 0 44 44" fill="none" className={className}>
    <rect width="44" height="44" rx="14" fill="url(#brief-bg)" />
    <rect x="12" y="10" width="20" height="24" rx="3" fill="white" fillOpacity="0.2" stroke="white" strokeWidth="1.5" />
    <rect x="16" y="15" width="12" height="2" rx="1" fill="white" fillOpacity="0.8" />
    <rect x="16" y="20" width="8" height="2" rx="1" fill="white" fillOpacity="0.5" />
    <rect x="16" y="25" width="10" height="2" rx="1" fill="white" fillOpacity="0.5" />
    <circle cx="30" cy="30" r="6" fill="white" fillOpacity="0.9" />
    <path d="M28.5 30L29.5 31L31.5 29" stroke="hsl(280, 60%, 50%)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <defs>
      <linearGradient id="brief-bg" x1="0" y1="0" x2="44" y2="44">
        <stop stopColor="hsl(260, 65%, 55%)" />
        <stop offset="1" stopColor="hsl(290, 55%, 50%)" />
      </linearGradient>
    </defs>
  </svg>
);

export const BrandIconSmartMsg = ({ className = "w-10 h-10" }: { className?: string }) => (
  <svg viewBox="0 0 44 44" fill="none" className={className}>
    <rect width="44" height="44" rx="14" fill="url(#smartmsg-bg)" />
    <rect x="8" y="12" width="20" height="13" rx="3" fill="white" fillOpacity="0.8" />
    <path d="M12 25L8 30V25H12Z" fill="white" fillOpacity="0.8" />
    <rect x="12" y="17" width="12" height="1.5" rx="0.75" fill="hsl(330, 80%, 50%)" fillOpacity="0.4" />
    <rect x="12" y="20.5" width="8" height="1.5" rx="0.75" fill="hsl(330, 80%, 50%)" fillOpacity="0.3" />
    <circle cx="32" cy="16" r="5" fill="white" fillOpacity="0.3" stroke="white" strokeWidth="1.5" />
    <path d="M30 16L31.5 17.5L34 15" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <defs>
      <linearGradient id="smartmsg-bg" x1="0" y1="0" x2="44" y2="44">
        <stop stopColor="hsl(200, 70%, 50%)" />
        <stop offset="1" stopColor="hsl(230, 65%, 55%)" />
      </linearGradient>
    </defs>
  </svg>
);

export const BrandIconAutomation = ({ className = "w-10 h-10" }: { className?: string }) => (
  <svg viewBox="0 0 44 44" fill="none" className={className}>
    <rect width="44" height="44" rx="14" fill="url(#auto-bg)" />
    <path d="M22 12V18L26 22" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="22" cy="22" r="10" stroke="white" strokeWidth="2" fill="white" fillOpacity="0.1" />
    <path d="M22 12C17.5 12 14 15.5 14 20" stroke="white" strokeWidth="2" strokeLinecap="round" />
    <path d="M15 12L14 17H18" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <defs>
      <linearGradient id="auto-bg" x1="0" y1="0" x2="44" y2="44">
        <stop stopColor="hsl(20, 80%, 55%)" />
        <stop offset="1" stopColor="hsl(350, 75%, 50%)" />
      </linearGradient>
    </defs>
  </svg>
);

// Audience icons
export const BrandIconStartup = ({ className = "w-10 h-10" }: { className?: string }) => (
  <svg viewBox="0 0 44 44" fill="none" className={className}>
    <rect width="44" height="44" rx="14" fill="url(#startup-bg)" />
    <path d="M22 10L26 20H18L22 10Z" fill="white" fillOpacity="0.9" />
    <path d="M18 20L14 28H30L26 20" fill="white" fillOpacity="0.5" />
    <rect x="20" y="28" width="4" height="6" rx="1" fill="white" fillOpacity="0.7" />
    <defs>
      <linearGradient id="startup-bg" x1="0" y1="0" x2="44" y2="44">
        <stop stopColor="hsl(330, 80%, 55%)" />
        <stop offset="1" stopColor="hsl(350, 75%, 50%)" />
      </linearGradient>
    </defs>
  </svg>
);

export const BrandIconAgency = ({ className = "w-10 h-10" }: { className?: string }) => (
  <svg viewBox="0 0 44 44" fill="none" className={className}>
    <rect width="44" height="44" rx="14" fill="url(#agency-bg)" />
    <rect x="10" y="16" width="24" height="16" rx="3" stroke="white" strokeWidth="2" fill="white" fillOpacity="0.1" />
    <rect x="15" y="20" width="6" height="8" rx="1.5" fill="white" fillOpacity="0.7" />
    <rect x="23" y="20" width="6" height="8" rx="1.5" fill="white" fillOpacity="0.4" />
    <path d="M18 16V12H26V16" stroke="white" strokeWidth="2" strokeLinecap="round" />
    <defs>
      <linearGradient id="agency-bg" x1="0" y1="0" x2="44" y2="44">
        <stop stopColor="hsl(260, 65%, 55%)" />
        <stop offset="1" stopColor="hsl(280, 60%, 50%)" />
      </linearGradient>
    </defs>
  </svg>
);

export const BrandIconEcommerce = ({ className = "w-10 h-10" }: { className?: string }) => (
  <svg viewBox="0 0 44 44" fill="none" className={className}>
    <rect width="44" height="44" rx="14" fill="url(#ecom-bg)" />
    <path d="M12 14H16L20 28H30" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="22" cy="32" r="2" fill="white" fillOpacity="0.8" />
    <circle cx="28" cy="32" r="2" fill="white" fillOpacity="0.8" />
    <rect x="18" y="18" width="14" height="8" rx="2" fill="white" fillOpacity="0.4" stroke="white" strokeWidth="1.5" />
    <defs>
      <linearGradient id="ecom-bg" x1="0" y1="0" x2="44" y2="44">
        <stop stopColor="hsl(160, 60%, 45%)" />
        <stop offset="1" stopColor="hsl(180, 55%, 40%)" />
      </linearGradient>
    </defs>
  </svg>
);

export const BrandIconLocal = ({ className = "w-10 h-10" }: { className?: string }) => (
  <svg viewBox="0 0 44 44" fill="none" className={className}>
    <rect width="44" height="44" rx="14" fill="url(#local-bg)" />
    <path d="M22 10C17.5 10 14 13.5 14 18C14 24 22 34 22 34C22 34 30 24 30 18C30 13.5 26.5 10 22 10Z" fill="white" fillOpacity="0.3" stroke="white" strokeWidth="2" />
    <circle cx="22" cy="18" r="4" fill="white" fillOpacity="0.8" />
    <defs>
      <linearGradient id="local-bg" x1="0" y1="0" x2="44" y2="44">
        <stop stopColor="hsl(35, 80%, 55%)" />
        <stop offset="1" stopColor="hsl(15, 75%, 50%)" />
      </linearGradient>
    </defs>
  </svg>
);

export const BrandIconGrowth = ({ className = "w-10 h-10" }: { className?: string }) => (
  <svg viewBox="0 0 44 44" fill="none" className={className}>
    <rect width="44" height="44" rx="14" fill="url(#growth-bg)" />
    <path d="M10 30L18 22L24 26L34 14" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M28 14H34V20" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <defs>
      <linearGradient id="growth-bg" x1="0" y1="0" x2="44" y2="44">
        <stop stopColor="hsl(200, 70%, 50%)" />
        <stop offset="1" stopColor="hsl(230, 65%, 55%)" />
      </linearGradient>
    </defs>
  </svg>
);
