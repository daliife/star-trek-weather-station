import { describe, expect, it } from 'vitest';
import { isTheme, themes } from './theme';

describe('theme', () => {
  it('accepts the three LCARS palettes', () => {
    expect(themes).toEqual(['classic', 'voyager', 'nemesis']);
    expect(isTheme('classic')).toBe(true);
    expect(isTheme('voyager')).toBe(true);
    expect(isTheme('nemesis')).toBe(true);
    expect(isTheme('picard')).toBe(false);
    expect(isTheme(null)).toBe(false);
  });
});
