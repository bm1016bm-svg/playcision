export type StoreId = 'steam';

export interface Money {
  /** Steam's integer hundredths (for example, NT$300.00 is 30000). */
  minor: number;
  currency: string;
  formatted?: string;
}

export interface GamePrice {
  current: Money | null;
  original: Money | null;
  discountPercent: number;
  isFree: boolean;
}

export interface Game {
  id: string;
  store: StoreId;
  name: string;
  url: string;
  imageUrl?: string;
  releaseDate?: string;
  developers: string[];
  publishers: string[];
  tags: string[];
  genres: string[];
  platforms: string[];
  playerCategories?: number[];
  earlyAccess: boolean;
  mature: boolean;
  price: GamePrice;
  source: {
    fetchedAt: string;
    provider: string;
  };
}

export interface Recommendation {
  game: Game;
  reason: string[];
  seed: string;
  candidateCount: number;
  selectedIndex: number;
  weight: number;
}

export interface Digest {
  generatedAt: string;
  discover: Game[];
  deals: Game[];
  roll?: Recommendation;
  warnings: string[];
}

export interface ProviderQuery {
  country: string;
  currency: string;
  language: string;
  tags: string[];
  genres: string[];
  developers: string[];
  includeAppIds: string[];
  maxPages: number;
  limit: number;
  includeMature: boolean;
}

export interface GameProvider {
  readonly id: StoreId;
  getNewReleases(query: ProviderQuery): Promise<Game[]>;
  getDeals(query: ProviderQuery): Promise<Game[]>;
  getApps(appIds: string[], query: ProviderQuery): Promise<Game[]>;
  getWishlistAppIds?(steamId: string): Promise<string[]>;
  getWarnings?(): Array<{ message: string }>;
  diagnose(): Promise<ProviderDiagnostic>;
}

export interface ProviderDiagnostic {
  ok: boolean;
  name: string;
  message: string;
  latencyMs?: number;
}
