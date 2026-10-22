import { describe, expect, it } from 'vitest';
import { LANGUAGES, DEFAULT_LOCALE, MESSAGES, isLocale, translate } from '../src/web/consumer/locales.js';
import { steamPresentationLanguage } from '../src/ui/language.js';
import { shareList } from '../src/web/consumer/share.js';

describe('consumer languages', () => {
  it('defaults to Traditional Chinese and maps all thirteen choices to Steam', () => {
    expect(DEFAULT_LOCALE).toBe('zh-TW');
    expect(LANGUAGES).toHaveLength(13);
    expect(new Set(LANGUAGES.map(item => item.code)).size).toBe(13);
    for (const item of LANGUAGES) {
      expect(isLocale(item.code)).toBe(true);
      expect(steamPresentationLanguage(item.code, 'tchinese')).toBe(item.steam);
    }
    expect(isLocale('invalid')).toBe(false);
  });
  it('has complete nonempty translation columns for every message', () => {
    for (const [key, values] of Object.entries(MESSAGES)) {
      expect(values, key).toHaveLength(12);
      expect(values.every(value => value.trim().length > 0), key).toBe(true);
      expect(translate(key, DEFAULT_LOCALE)).toBe(key);
    }
    expect(translate('探索', 'en')).toBe('Explore');
    expect(translate('收藏', 'ja')).toBe('お気に入り');
    expect(translate('Game title', 'de')).toBe('Game title');
  });
  it('localizes share headings while retaining canonical links', () => {
    expect(shareList([{ id: '42', name: 'Game' }], 'text', translate('本次收藏', 'en')))
      .toEqual(['Playcision · Your saved games\n\nGame\nhttps://store.steampowered.com/app/42/']);
  });
});
