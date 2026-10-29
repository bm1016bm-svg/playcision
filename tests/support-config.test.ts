import { describe, expect, it } from 'vitest';
import { payuniLink, githubProjectLink, supportConfiguration, supportOptions } from '../src/web/support-config.js';

const base = 'https://api.payuni.com.tw/api/uop/receive_info/2/1/U047103583/';
const first = `${base}ABCDEFGHIJKLMNOPQRSTU`;
const second = `${base}abcdefghijklmnopqrstu`;

describe('hosted support payment links', () => {
  it('keeps exact amounts and approved copy, with no placeholder checkout', () => {
    expect(supportOptions({})).toEqual([
      { amount: 100, message: '幫作者把星巴克加到滿杯', url: null },
      { amount: 500, message: '可以繼續租伺服器，動起來了傑克', url: null },
      { amount: 1000, message: '而你 我的朋友，你是椰汁城的傳奇', url: null },
    ]);
  });
  it('accepts the observed PAYUNi reusable checkout format for the creator merchant', () => {
    expect(payuniLink(first)).toBe(first);
    expect(payuniLink(`  ${second}  `)).toBe(second);
  });
  it.each([
    'javascript:alert(1)', first.replace('https:', 'http:'), first.replace('.com.tw', '.com.tw.evil.test'),
    first.replace('api.payuni.com.tw', 'api.payuni.com.tw@evil.test'), first.replace('https://', 'https://user:pass@'),
    `${first}?redirect=https://evil.test`, `${first}#fragment`, first.replace('api.payuni', 'sandbox-api.payuni'),
    first.replace('api.payuni.com.tw', 'api.payuni.com.tw:444'), first.replace('U047103583', 'U999999999'),
    first.replace('/2/1/', '/1/1/'), first.replace('/2/1/', '/2/0/'), first.replace('/receive_info/', '/upp/'),
    `${first}/`, first.slice(0, -1), `${first}V`, `${base}%2FABCDEFGHIJKLMNOPQRS`,
    'https://api.payuni.com.tw/', 'https://api.payuni.com.tw/api/upp', 'https://www.payuni.com.tw/login',
    'https://p.ecpay.com.tw/AB12345', '', null, undefined, 100,
  ])('rejects unsafe, other-merchant, demo or unsupported URL: %s', value => expect(payuniLink(value)).toBeNull());
  it('keeps payment disabled while links are prepared but merchant approval is pending', () => {
    const config = supportConfiguration({ VITE_PAYUNI_100_URL: first });
    expect(config.configured[0]?.url).toBe(first);
    expect(config.enabled).toBe(false);
    expect(config.options.every(tier => tier.url === null)).toBe(true);
  });
  it.each([undefined, '', 'false', 'TRUE', '1', 'yes', true, 1])('requires an explicit release switch, not truthy value %s', enabled => {
    expect(supportOptions({ VITE_PAYUNI_COLLECTION_ENABLED: enabled, VITE_PAYUNI_100_URL: first }).every(tier => tier.url === null)).toBe(true);
  });
  it('disables duplicated fixed-price URLs instead of charging the wrong tier', () => {
    expect(supportOptions({ VITE_PAYUNI_COLLECTION_ENABLED: 'true', VITE_PAYUNI_100_URL: first, VITE_PAYUNI_500_URL: ` ${first} ` }).every(tier => tier.url === null)).toBe(true);
  });
  it('enables configured tiers independently', () => {
    const options = supportOptions({ VITE_PAYUNI_COLLECTION_ENABLED: 'true', VITE_PAYUNI_100_URL: first, VITE_PAYUNI_500_URL: second });
    expect(options.map(tier => tier.url)).toEqual([first, second, null]);
  });
  it('does not reuse legacy ECPay settings after the provider migration', () => {
    expect(supportOptions({ VITE_PAYUNI_COLLECTION_ENABLED: 'true', VITE_ECPAY_100_URL: 'https://p.ecpay.com.tw/AB12345' }).every(tier => tier.url === null)).toBe(true);
  });
  it('links stars to an author-owned repository, never an arbitrary external site', () => {
    expect(githubProjectLink('https://github.com/bm1016bm-svg/playcision')).not.toBeNull();
    for (const link of ['https://github.com/other/playcision', 'https://github.com/bm1016bm-svg', 'https://github.com/bm1016bm-svg/playcision?x=1', 'javascript:alert(1)']) expect(githubProjectLink(link)).toBeNull();
  });
});
