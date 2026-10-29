import type { CloudEnv } from './common.js';

/** Public entry: validate deployment bindings without requiring an account or invitation. */
export function configured(env: CloudEnv): boolean {
  try {
    const origin = new URL(env.APP_ORIGIN);
    return origin.origin === env.APP_ORIGIN && !origin.username && !origin.password
      && (origin.protocol === 'https:' || (origin.protocol === 'http:' && origin.hostname === '127.0.0.1'))
      && !!env.COORDINATOR && !!env.ASSETS && !!env.ROOMS;
  } catch { return false; }
}
