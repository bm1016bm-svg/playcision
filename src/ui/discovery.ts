import { z } from 'zod';

export const discoveryRequest = z.object({
  source: z.union([z.enum(['popular', 'discover', 'deals']), z.string().regex(/^event:\d{1,20}$/)]),
  genre: z.string().trim().min(1).max(100),
  platform: z.enum(['all', 'windows', 'mac', 'linux']),
  price: z.enum(['all', 'under300', 'free', 'paid']),
  players: z.enum(['all', 'single', 'multi']),
  earlyAccess: z.enum(['all', 'only', 'exclude']),
  offset: z.coerce.number().int().min(0).max(10000).refine(value => value % 50 === 0),
}).strict().refine(value => value.source.startsWith('event:') || value.offset <= 1000);
export type DiscoveryRequest = z.infer<typeof discoveryRequest>;
