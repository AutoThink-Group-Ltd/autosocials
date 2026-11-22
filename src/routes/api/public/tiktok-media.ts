import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/tiktok-media')({
  server: { handlers: {
    GET: async ({ request }) => (await import('@/lib/tiktok-media.server')).handleTikTokMedia(request),
    HEAD: async ({ request }) => (await import('@/lib/tiktok-media.server')).handleTikTokMedia(request),
  } },
});
