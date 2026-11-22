import { useLocation } from "@/lib/router-compat";
import { useWebsiteTracking } from "@/hooks/useWebsiteTracking";

/**
 * Invisible wrapper that auto-tracks page views on public/marketing pages.
 * Place this inside any layout that wraps public routes.
 */
const PublicTrackingWrapper = () => {
  const { pathname } = useLocation();
  useWebsiteTracking(pathname);
  return null;
};

export default PublicTrackingWrapper;
