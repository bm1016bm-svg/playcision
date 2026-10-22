import { z } from 'zod';

const stringList = z.array(z.string().trim().min(1)).default([]);
const appIdList = z.array(z.coerce.string().regex(/^\d+$/, 'Expected a numeric Steam App ID')).default([]);

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function looksLikeCron(value: string): boolean {
  return value.trim().split(/\s+/).length === 5;
}

export const configSchema = z
  .object({
    version: z.literal(1).default(1),
    locale: z
      .object({
        country: z.string().regex(/^[A-Z]{2}$/, 'Expected an uppercase ISO 3166-1 alpha-2 code').default('TW'),
        currency: z.string().regex(/^[A-Z]{3}$/, 'Expected an uppercase 3-letter currency code').default('TWD'),
        language: z.string().min(2).default('tchinese'),
      })
      .strict()
      .default({ country: 'TW', currency: 'TWD', language: 'tchinese' }),
    providers: z
      .object({
        steam: z
          .object({
            enabled: z.boolean().default(true),
            maxPages: z.number().int().min(1).max(10).default(2),
            requestDelayMs: z.number().int().min(0).max(10_000).default(350),
            timeoutMs: z.number().int().min(1_000).max(60_000).default(15_000),
          })
          .strict()
          .default({ enabled: true, maxPages: 2, requestDelayMs: 350, timeoutMs: 15_000 }),
      })
      .strict()
      .default({
        steam: { enabled: true, maxPages: 2, requestDelayMs: 350, timeoutMs: 15_000 },
      }),
    interests: z
      .object({
        tags: stringList,
        genres: stringList,
        developers: stringList,
        includeAppIds: appIdList,
        excludeAppIds: appIdList,
      })
      .strict()
      .default({
        tags: [],
        genres: [],
        developers: [],
        includeAppIds: [],
        excludeAppIds: [],
      }),
    discover: z
      .object({
        days: z.number().int().min(1).max(365).default(7),
        limit: z.number().int().min(1).max(100).default(20),
        includeEarlyAccess: z.boolean().default(true),
        includeMature: z.boolean().default(true),
      })
      .strict()
      .default({ days: 7, limit: 20, includeEarlyAccess: true, includeMature: true }),
    deals: z
      .object({
        limit: z.number().int().min(1).max(100).default(20),
        maxPrice: z.number().min(0).nullable().default(300),
        minDiscountPercent: z.number().int().min(0).max(100).default(20),
        localObservedLowOnly: z.boolean().default(false),
        notifyPriceChanges: z.boolean().default(true),
        wishlistAppIds: appIdList,
        wishlistSteamId: z
          .string()
          .regex(/^\d{1,20}$/, 'Expected a numeric SteamID64')
          .nullable()
          .default(null),
      })
      .strict()
      .default({
        limit: 20,
        maxPrice: 300,
        minDiscountPercent: 20,
        localObservedLowOnly: false,
        notifyPriceChanges: true,
        wishlistAppIds: [],
        wishlistSteamId: null,
      }),
    roll: z
      .object({
        limit: z.number().int().min(1).max(500).default(100),
        maxPrice: z.number().min(0).nullable().default(null),
        tags: stringList,
        mode: z.enum(['uniform', 'weighted']).default('weighted'),
        weights: z
          .object({
            discounted: z.number().positive().max(10).default(1.15),
            interestMatch: z.number().positive().max(10).default(1.3),
            neverNotified: z.number().positive().max(10).default(1.1),
          })
          .strict()
          .default({ discounted: 1.15, interestMatch: 1.3, neverNotified: 1.1 }),
      })
      .strict()
      .default({
        limit: 100,
        maxPrice: null,
        tags: [],
        mode: 'weighted',
        weights: { discounted: 1.15, interestMatch: 1.3, neverNotified: 1.1 },
      }),
    outputs: z
      .object({
        markdown: z
          .object({
            enabled: z.boolean().default(true),
            path: z.string().min(1).default('.playcision/outputs/digest.md'),
          })
          .strict()
          .default({ enabled: true, path: '.playcision/outputs/digest.md' }),
        json: z
          .object({
            enabled: z.boolean().default(false),
            path: z.string().min(1).default('.playcision/outputs/digest.json'),
          })
          .strict()
          .default({ enabled: false, path: '.playcision/outputs/digest.json' }),
        slack: z
          .object({
            enabled: z.boolean().default(false),
            webhookEnv: z.string().regex(/^[A-Z_][A-Z0-9_]*$/).default('SLACK_WEBHOOK_URL'),
          })
          .strict()
          .default({ enabled: false, webhookEnv: 'SLACK_WEBHOOK_URL' }),
      })
      .strict()
      .default({
        markdown: { enabled: true, path: '.playcision/outputs/digest.md' },
        json: { enabled: false, path: '.playcision/outputs/digest.json' },
        slack: { enabled: false, webhookEnv: 'SLACK_WEBHOOK_URL' },
      }),
    state: z
      .object({
        enabled: z.boolean().default(true),
        retentionDays: z.number().int().min(1).max(3650).default(90),
      })
      .strict()
      .default({ enabled: true, retentionDays: 90 }),
    schedule: z
      .object({
        type: z.enum(['none', 'local', 'github']).default('none'),
        cron: z.string().refine(looksLikeCron, 'Expected a five-field POSIX cron expression').default('0 9 * * *'),
        timezone: z.string().refine(isValidTimeZone, 'Expected a valid IANA time zone').default('Asia/Taipei'),
      })
      .strict()
      .default({ type: 'none', cron: '0 9 * * *', timezone: 'Asia/Taipei' }),
  })
  .strict()
  .superRefine((config, context) => {
    if (config.deals.localObservedLowOnly && !config.state.enabled) {
      context.addIssue({
        code: 'custom',
        path: ['deals', 'localObservedLowOnly'],
        message: 'Local observed lows require state.enabled: true',
      });
    }
  });

export type PlaycisionConfig = z.infer<typeof configSchema>;

export const defaultConfig: PlaycisionConfig = configSchema.parse({});
