export function isWorkspaceLinkedInCover(workspaceId: string, path: string): boolean {
  const prefix = `${workspaceId}/social-previews/linkedin/`;
  return path.startsWith(prefix) && /^[a-f0-9]{64}\.(?:jpg|png|webp)$/.test(path.slice(prefix.length));
}
