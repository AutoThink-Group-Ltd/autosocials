const required = ['openid', 'profile', 'w_member_social'];

/** LinkedIn may return the approved scopes separated by commas or spaces. */
export function hasRequiredLinkedInScopes(scope: unknown, expected = required): boolean {
  if (scope === undefined) return true; // Some token responses omit scope entirely.
  if (typeof scope !== 'string') return false;
  const granted = new Set(scope.split(/[,\s]+/).filter(Boolean));
  return expected.every(item => granted.has(item));
}
