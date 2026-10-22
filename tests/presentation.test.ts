import { steamPresentationLanguage } from '../src/ui/language.js';
import { describe, expect, it } from 'vitest';
import { parseAppPresentation, parsePresentationArtwork } from '../src/provider/parsers.js';

describe('Steam presentation sidecar', () => {
  it('uses supplied full screenshot URLs and localized plain synopsis', () => {
    expect(parseAppPresentation({ 42: { success: true, data: { short_description: '<b>探索</b><br>森林 &amp; 星海<script>bad()</script>', screenshots: [{ path_full: 'https://cdn.example/full.jpg' }], header_image: 'https://cdn.example/header.jpg' } } }, '42')).toEqual({ description: '探索 森林 & 星海', images: ['https://cdn.example/header.jpg', 'https://cdn.example/full.jpg'] });
  });
  it('keeps missing optional information empty without generated claims', () => {
    expect(parseAppPresentation({ 42: { success: true, data: {} } }, '42')).toEqual({ description: '', images: [] });
    expect(parseAppPresentation({ 42: { success: false } }, '42')).toEqual({ description: '', images: [] });
  });
  it('rejects unsafe images and preserves text as data', () => {
    expect(parseAppPresentation({ 42: { success: true, data: { short_description: '&lt;img onerror=bad&gt;', screenshots: [{ path_full: 'javascript:bad()' }], header_image: 'http://unsafe.example/a.jpg' } } }, '42')).toEqual({ description: '<img onerror=bad>', images: [] });
  });
  it('reports malformed response and schema drift', () => {
    for (const input of [null, {}, { 42: { success: 'true' } }, { 42: { success: true } }]) expect(() => parseAppPresentation(input, '42')).toThrow();
  });
});

it('uses only Steam-supplied high resolution asset names for the matching app', () => {
  const assets = { asset_url_format: 'steam/apps/42/${FILENAME}?t=1', main_capsule_2x: 'hash/actual-large.jpg', header: 'hash/header.jpg' };
  expect(parsePresentationArtwork({ response: { store_items: [{ appid: 42, assets }] } }, '42')).toEqual([
    'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/42/hash/actual-large.jpg?t=1',
    'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/42/hash/header.jpg?t=1',
  ]);
  expect(parsePresentationArtwork({ response: { store_items: [{ appid: 43, assets }] } }, '42')).toEqual([]);
  expect(parsePresentationArtwork({}, '42')).toEqual([]);
});

it('maps the visible UI language to Steam and safely retains configured fallback', () => {
  for (const language of ['zh-Hant', 'zh-TW', 'zh-HK', 'tchinese']) expect(steamPresentationLanguage(language, 'english')).toBe('tchinese');
  expect(steamPresentationLanguage('en-US', 'tchinese')).toBe('english');
  expect(steamPresentationLanguage('ja-JP', 'english')).toBe('japanese');
  expect(steamPresentationLanguage(null, 'tchinese')).toBe('tchinese');
  expect(steamPresentationLanguage('unsupported', 'tchinese')).toBe('tchinese');
});
