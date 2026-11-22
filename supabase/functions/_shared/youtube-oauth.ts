export const YOUTUBE_SCOPES = ['https://www.googleapis.com/auth/youtube.upload','https://www.googleapis.com/auth/youtube.readonly'] as const;
export function hasRequiredYouTubeScopes(scope: string) {
  const granted = new Set(scope.split(/\s+/).filter(Boolean));
  return YOUTUBE_SCOPES.every(required => granted.has(required));
}
