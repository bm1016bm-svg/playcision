// Public payment links only. Never put merchant keys or credentials in VITE_*.
export const SUPPORT_TIERS = [
  { amount: 100, message: '幫作者把星巴克加到滿杯' },
  { amount: 500, message: '可以繼續租伺服器，動起來了傑克' },
  { amount: 1000, message: '而你 我的朋友，你是椰汁城的傳奇' },
] as const;

export const CREATOR_URL = 'https://github.com/bm1016bm-svg';

/** Accept only hosted, reusable production checkout links, not arbitrary redirects. */
export function ecpayLink(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 512) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) return null;
    const allowed = (url.hostname === 'p.ecpay.com.tw' && /^\/[A-Za-z0-9]{4,64}$/.test(url.pathname))
      || (url.hostname === 'cart.cashier.ecpay.com.tw' && /^\/qp\/[A-Za-z0-9_-]{4,100}$/.test(url.pathname));
    return allowed ? url.href : null;
  } catch { return null; }
}

export function githubProjectLink(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value.trim());
    return url.origin === 'https://github.com' && !url.username && !url.password && !url.search && !url.hash
      && /^\/bm1016bm-svg\/[A-Za-z0-9_.-]+\/?$/.test(url.pathname) ? url.href : null;
  } catch { return null; }
}

export function supportOptions(env: Record<string, unknown>) {
  const links = SUPPORT_TIERS.map(tier => ecpayLink(env[`VITE_ECPAY_${tier.amount}_URL`]));
  // Reusing one fixed-amount link for different tiers risks charging the wrong amount.
  const duplicate = links.some((link, index) => link && links.indexOf(link) !== index);
  return SUPPORT_TIERS.map((tier, index) => ({ ...tier, url: duplicate ? null : links[index] ?? null }));
}
