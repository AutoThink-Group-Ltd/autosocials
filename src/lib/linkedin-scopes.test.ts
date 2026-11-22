import { describe, expect, it } from 'vitest';
import { hasRequiredLinkedInScopes } from '../../supabase/functions/_shared/linkedin-scopes';

describe('LinkedIn granted scopes', () => {
  it.each([
    'openid,profile,w_member_social',
    'openid profile w_member_social',
    'profile, openid, w_member_social, email',
  ])('accepts all required permissions in %s', value => {
    expect(hasRequiredLinkedInScopes(value)).toBe(true);
  });
  it('rejects missing, partial, or malformed scope strings', () => {
    expect(hasRequiredLinkedInScopes('openid,profile')).toBe(false);
    expect(hasRequiredLinkedInScopes('openid profile w_member_social_extra')).toBe(false);
    expect(hasRequiredLinkedInScopes('')).toBe(false);
    expect(hasRequiredLinkedInScopes(null)).toBe(false);
  });
  it('accepts a token response that omits scope', () => {
    expect(hasRequiredLinkedInScopes(undefined)).toBe(true);
  });
});
