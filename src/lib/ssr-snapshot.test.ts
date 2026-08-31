import { describe, expect, it } from 'vitest';
import { initial } from './ssr-snapshot';

describe('ssr snapshot', () => {
  it('paints numeric current conditions from the baked JSON', () => {
    expect(initial.temp).not.toBe('No data');
    expect(initial.tempUnit).toBe('°C');
    expect(initial.hourly).toHaveLength(6);
    expect(initial.lastDays).toHaveLength(7);
  });
});
