import { describe, expect, it } from 'vitest';
import { matchesResearchDate } from './ResearchDateFilter';

describe('research post date ranges', () => {
  const now = new Date(2026, 10, 15, 12);
  it('includes today and the previous six or 29 calendar days', () => {
    expect(matchesResearchDate('2026-11-15', 'today', now)).toBe(true);
    expect(matchesResearchDate('2026-11-14', 'today', now)).toBe(false);
    expect(matchesResearchDate('2026-11-09', '7', now)).toBe(true);
    expect(matchesResearchDate('2026-11-08', '7', now)).toBe(false);
    expect(matchesResearchDate('2026-10-17', '30', now)).toBe(true);
    expect(matchesResearchDate('2026-10-16', '30', now)).toBe(false);
    expect(matchesResearchDate('2026-11-16', '30', now)).toBe(false);
  });
  it('keeps undated posts available under all time', () => {
    expect(matchesResearchDate(undefined, 'all', now)).toBe(true);
    expect(matchesResearchDate(undefined, '7', now)).toBe(false);
    expect(matchesResearchDate('invalid', 'today', now)).toBe(false);
  });
});
