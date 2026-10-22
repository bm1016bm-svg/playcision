import { describe, expect, it } from 'vitest';
import { ecpayLink, githubProjectLink, supportOptions } from '../src/web/support-config.js';

describe('hosted support payment links', () => {
  it('keeps exact amounts and approved copy, with no placeholder checkout', () => {
    expect(supportOptions({})).toEqual([
      { amount: 100, message: '幫作者把星巴克加到滿杯', url: null },
      { amount: 500, message: '可以繼續租伺服器，動起來了傑克', url: null },
      { amount: 1000, message: '而你 我的朋友，你是椰汁城的傳奇', url: null },
    ]);
  });
  it('accepts official hosted link formats', () => {
    expect(ecpayLink('https://p.ecpay.com.tw/AB12345')).toBe('https://p.ecpay.com.tw/AB12345');
    expect(ecpayLink('https://cart.cashier.ecpay.com.tw/qp/test1234')).toBe('https://cart.cashier.ecpay.com.tw/qp/test1234');
  });
  it.each([
    'javascript:alert(1)', 'http://p.ecpay.com.tw/AB12345', 'https://p.ecpay.com.tw.evil.test/AB12345',
    'https://p.ecpay.com.tw@evil.test/AB12345', 'https://user:pass@p.ecpay.com.tw/AB12345',
    'https://p.ecpay.com.tw/AB12345?redirect=https://evil.test', 'https://p.ecpay.com.tw/AB12345#fragment',
    'https://p-beta.ecpay.com.tw/AB12345', 'https://cart.cashier.ecpay.com.tw/qp/x1',
    'https://p.ecpay.com.tw:444/AB12345', 'https://p.ecpay.com.tw/', '',
  ])('rejects unsafe, demo or unsupported URL: %s', value => expect(ecpayLink(value)).toBeNull());
  it('disables duplicated fixed-price URLs instead of charging the wrong tier', () => {
    expect(supportOptions({ VITE_ECPAY_100_URL: 'https://p.ecpay.com.tw/AB12345', VITE_ECPAY_500_URL: 'https://p.ecpay.com.tw/AB12345' }).every(tier => tier.url === null)).toBe(true);
  });
  it('enables configured tiers independently', () => {
    const options = supportOptions({ VITE_ECPAY_100_URL: 'https://p.ecpay.com.tw/AB12345' });
    expect(options.map(tier => !!tier.url)).toEqual([true, false, false]);
  });
  it('links stars to an author-owned repository, never an arbitrary external site', () => {
    expect(githubProjectLink('https://github.com/bm1016bm-svg/playcision')).not.toBeNull();
    for (const link of ['https://github.com/other/playcision', 'https://github.com/bm1016bm-svg', 'https://github.com/bm1016bm-svg/playcision?x=1', 'javascript:alert(1)']) expect(githubProjectLink(link)).toBeNull();
  });
});
