import { describe, expect, it, vi } from 'vitest';
import { isFullscreenActive, isFullscreenSupported, toggleFullscreen } from './fullscreen';

function fakeDoc(partial: Record<string, unknown>): Document {
  return partial as unknown as Document;
}

describe('fullscreen', () => {
  it('is supported when either standard or webkit flag is on', () => {
    expect(isFullscreenSupported(fakeDoc({ fullscreenEnabled: false }))).toBe(false);
    expect(isFullscreenSupported(fakeDoc({ fullscreenEnabled: true }))).toBe(true);
    expect(isFullscreenSupported(fakeDoc({ fullscreenEnabled: false, webkitFullscreenEnabled: true }))).toBe(true);
  });

  it('is active when either standard or webkit element is set', () => {
    const el = {} as Element;
    expect(isFullscreenActive(fakeDoc({ fullscreenElement: null }))).toBe(false);
    expect(isFullscreenActive(fakeDoc({ fullscreenElement: el }))).toBe(true);
    expect(isFullscreenActive(fakeDoc({ fullscreenElement: null, webkitFullscreenElement: el }))).toBe(true);
  });

  it('requests fullscreen on the target when idle', async () => {
    const requestFullscreen = vi.fn(async () => undefined);
    const target = { requestFullscreen } as unknown as Element;
    await toggleFullscreen(target, fakeDoc({ fullscreenElement: null }));
    expect(requestFullscreen).toHaveBeenCalledOnce();
  });

  it('exits fullscreen when already active', async () => {
    const exitFullscreen = vi.fn(async () => undefined);
    const target = { requestFullscreen: vi.fn() } as unknown as Element;
    await toggleFullscreen(target, fakeDoc({ fullscreenElement: target, exitFullscreen }));
    expect(exitFullscreen).toHaveBeenCalledOnce();
  });

  it('uses webkit methods when the standard API is missing', async () => {
    const webkitRequestFullscreen = vi.fn();
    const webkitExitFullscreen = vi.fn();
    const target = { webkitRequestFullscreen } as unknown as Element;
    await toggleFullscreen(target, fakeDoc({ fullscreenElement: null }));
    expect(webkitRequestFullscreen).toHaveBeenCalledOnce();
    await toggleFullscreen(
      target,
      fakeDoc({ webkitFullscreenElement: target, webkitExitFullscreen }),
    );
    expect(webkitExitFullscreen).toHaveBeenCalledOnce();
  });
});
