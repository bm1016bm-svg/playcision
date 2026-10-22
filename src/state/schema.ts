import { z } from 'zod';

export const STATE_VERSION = 1 as const;

const isoTimestamp = z.string().datetime({ offset: true });
const gameId = z.string().trim().min(1);

export const storedMoneySchema = z
  .object({
    minor: z.number().int().nonnegative(),
    currency: z.string().regex(/^[A-Z]{3}$/, 'Expected an uppercase ISO 4217 currency code'),
  })
  .strict();

export const observedPriceSchema = z
  .object({
    current: storedMoneySchema.nullable(),
    lowestObserved: storedMoneySchema.nullable(),
    discountPercent: z.number().int().min(0).max(100),
    observedAt: isoTimestamp,
  })
  .strict()
  .superRefine((price, context) => {
    if (
      price.current !== null &&
      price.lowestObserved !== null &&
      price.current.currency !== price.lowestObserved.currency
    ) {
      context.addIssue({
        code: 'custom',
        path: ['lowestObserved', 'currency'],
        message: 'lowestObserved must use the same currency as the current price',
      });
    }
    if (
      price.current !== null &&
      price.lowestObserved !== null &&
      price.current.currency === price.lowestObserved.currency &&
      price.lowestObserved.minor > price.current.minor
    ) {
      context.addIssue({
        code: 'custom',
        path: ['lowestObserved'],
        message: 'lowestObserved cannot be greater than the current price',
      });
    }
  });

export const notificationSchema = z
  .object({
    at: isoTimestamp,
    price: storedMoneySchema.nullable(),
    discountPercent: z.number().int().min(0).max(100),
  })
  .strict();

export const skippedGameSchema = z
  .object({
    until: isoTimestamp,
  })
  .strict();

export const playcisionStateSchema = z
  .object({
    version: z.literal(STATE_VERSION),
    lastRunAt: isoTimestamp.nullable(),
    prices: z.record(gameId, observedPriceSchema),
    notified: z.record(gameId, notificationSchema),
    skipped: z.record(gameId, skippedGameSchema),
    excluded: z.array(gameId),
  })
  .strict();

export type StoredMoney = z.infer<typeof storedMoneySchema>;
export type ObservedPrice = z.infer<typeof observedPriceSchema>;
export type NotificationRecord = z.infer<typeof notificationSchema>;
export type SkippedGame = z.infer<typeof skippedGameSchema>;
export type PlaycisionState = z.infer<typeof playcisionStateSchema>;

export function createInitialState(): PlaycisionState {
  return {
    version: STATE_VERSION,
    lastRunAt: null,
    prices: {},
    notified: {},
    skipped: {},
    excluded: [],
  };
}

export const createEmptyState = createInitialState;
