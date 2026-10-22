import { describe, expect, it } from 'vitest';
import { configSchema, defaultConfig } from '../src/config/schema.js';

describe('configSchema', () => {
  it('builds a complete local-first default config', () => {
    expect(defaultConfig.version).toBe(1);
    expect(defaultConfig.locale).toEqual({ country: 'TW', currency: 'TWD', language: 'tchinese' });
    expect(defaultConfig.discover.includeMature).toBe(true);
    expect(defaultConfig.discover.includeEarlyAccess).toBe(true);
    expect(defaultConfig.outputs.slack.enabled).toBe(false);
  });

  it('rejects unknown keys instead of silently ignoring typos', () => {
    const result = configSchema.safeParse({ dealz: { maxPrice: 300 } });
    expect(result.success).toBe(false);
    expect(configSchema.safeParse({ deals: { maxPirce: 300 } }).success).toBe(false);
    expect(configSchema.safeParse({ outputs: { markdown: { paht: 'digest.md' } } }).success).toBe(false);
  });

  it('rejects non-numeric Steam App IDs', () => {
    const result = configSchema.safeParse({ deals: { wishlistAppIds: ['stardew'] } });
    expect(result.success).toBe(false);
  });

  it('validates an optional public SteamID64 for wishlist sync', () => {
    expect(configSchema.safeParse({ deals: { wishlistSteamId: '76561198000000000' } }).success).toBe(true);
    expect(configSchema.safeParse({ deals: { wishlistSteamId: 'private-profile' } }).success).toBe(false);
  });

  it('rejects invalid schedule timezone and cron values', () => {
    expect(configSchema.safeParse({ schedule: { timezone: 'Taipei', cron: 'daily' } }).success).toBe(false);
  });

  it('rejects observed-low rules when state is disabled', () => {
    expect(configSchema.safeParse({
      deals: { localObservedLowOnly: true },
      state: { enabled: false },
    }).success).toBe(false);
  });
});
