export interface Money {
  minor: number;
  currency: string;
  formatted?: string;
}

export interface Game {
  id: string;
  store: 'steam';
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
  price: {
    current: Money | null;
    original: Money | null;
    discountPercent: number;
    isFree: boolean;
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

export interface UiPayload {
  popular?: Game[];
  popularError?: string;
  blockedAppIds?: string[];
  digest: {
    generatedAt: string;
    discover: Game[];
    deals: Game[];
    roll?: Recommendation;
    warnings: string[];
  };
  locale: {
    country: string;
    currency: string;
    language: string;
  };
  filters: {
    discoverDays: number;
    dealMaxPrice: number | null;
    minDiscountPercent: number;
    rollMode: 'uniform' | 'weighted';
    tags: string[];
  };
}

export type DeckDecision = 'left' | 'right';
export type ViewId = 'roll' | 'discover' | 'deals' | 'tonight';
