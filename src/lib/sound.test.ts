import { afterEach, describe, expect, it } from 'vitest';
import { loadSoundEnabled } from './sound';

const SOUND_KEY = 'lcars.sound';

function mockStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorage });
}

describe('loadSoundEnabled', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage');
  });

  it('defaults off when nothing is stored', () => {
    mockStorage();
    expect(loadSoundEnabled()).toBe(false);
  });

  it('is on only when the stored value is on', () => {
    mockStorage();
    localStorage.setItem(SOUND_KEY, 'on');
    expect(loadSoundEnabled()).toBe(true);
    localStorage.setItem(SOUND_KEY, 'off');
    expect(loadSoundEnabled()).toBe(false);
  });
});
