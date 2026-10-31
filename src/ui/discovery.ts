import { z } from 'zod';

export const MAX_DISCOVERY_OFFSET = 100_000;

export const discoveryRequest = z.object({
  source: z.union([z.enum(['popular', 'discover', 'deals']), z.string().regex(/^event:\d{1,20}$/)]),
  genre: z.string().trim().min(1).max(100),
  platform: z.enum(['all', 'windows', 'mac', 'linux']),
  price: z.enum(['all', 'under300', 'free', 'paid']),
  players: z.enum(['all', 'single', 'multi']),
  earlyAccess: z.enum(['all', 'only', 'exclude']),
  offset: z.coerce.number().int().min(0).max(MAX_DISCOVERY_OFFSET).refine(value => value % 50 === 0),
}).strict().refine(value => !value.source.startsWith('event:') || value.offset <= 10000);
export type DiscoveryRequest = z.infer<typeof discoveryRequest>;
