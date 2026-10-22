import { load } from 'cheerio';
import type { Game, GamePrice, Money, ProviderQuery } from '../domain/types.js';
import { schemaDrift } from './errors.js';

const EARLY_ACCESS_TAG_ID = 493;
const MATURE_TAG_IDS = new Set([6650, 9130, 12095]);
const STEAM_ASSET_BASE = 'https://shared.fastly.steamstatic.com/store_item_assets/';

export interface SteamTagCatalog {
  byId: ReadonlyMap<number, string>;
  byNormalizedName: ReadonlyMap<string, number>;
}

export interface ParsedSearchPage {
  games: Game[];
  totalCount: number | undefined;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function integerValue(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function booleanValue(value: unknown): boolean {
  return value === true || value === 1;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export function normalizeTagName(name: string): string {
  return name.trim().normalize('NFKC').toLocaleLowerCase('en-US');
}

export function parseTagCatalog(payload: unknown): SteamTagCatalog {
  if (!Array.isArray(payload)) {
    throw schemaDrift('tag catalog', 'expected a JSON array');
  }

  const byId = new Map<number, string>();
  const byNormalizedName = new Map<string, number>();
  for (const [index, entry] of payload.entries()) {
    const record = asRecord(entry);
    const tagId = integerValue(record?.tagid);
    const name = stringValue(record?.name);
    if (tagId === undefined || tagId <= 0 || name === undefined) {
      throw schemaDrift('tag catalog', `invalid tag at index ${index}`);
    }
    byId.set(tagId, name);
    byNormalizedName.set(normalizeTagName(name), tagId);
  }

  if (byId.size === 0) {
    throw schemaDrift('tag catalog', 'received an empty tag list');
  }
  return { byId, byNormalizedName };
}

function money(minor: number, currency: string, formatted?: string): Money {
  return formatted === undefined ? { minor, currency } : { minor, currency, formatted };
}

function currencyFromFormatted(formatted: string | undefined, fallback: string): string {
  if (!formatted) return fallback.toUpperCase();
  const value = formatted.trim();
  const known: Array<[RegExp, string]> = [
    [/^NT\$/u, 'TWD'],
    [/^US\$/u, 'USD'],
    [/^HK\$/u, 'HKD'],
    [/^S\$/u, 'SGD'],
    [/^A\$/u, 'AUD'],
    [/^C\$/u, 'CAD'],
    [/^NZ\$/u, 'NZD'],
    [/^R\$/u, 'BRL'],
    [/^€/u, 'EUR'],
    [/^£/u, 'GBP'],
    [/^₩/u, 'KRW'],
    [/^₹/u, 'INR'],
    [/^₽/u, 'RUB'],
    [/^₫/u, 'VND'],
    [/^฿/u, 'THB'],
    [/^₺/u, 'TRY'],
    [/^₴/u, 'UAH'],
  ];
  return known.find(([pattern]) => pattern.test(value))?.[1] ?? fallback.toUpperCase();
}

function emptyPrice(): GamePrice {
  return { current: null, original: null, discountPercent: 0, isFree: false };
}

function parseTagIds(raw: string | undefined): number[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((value) => integerValue(value))
      .filter((value): value is number => value !== undefined && value > 0);
  } catch {
    return [];
  }
}

function safeImageUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Normalize Steam's localized date labels at the provider boundary. */
export function normalizeReleaseDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const value = raw.replace(/\s+/gu, ' ').trim();
  const yearFirst = value.match(/^(\d{4})\s*(?:年|[./-])\s*(\d{1,2})\s*(?:月|[./-])\s*(\d{1,2})\s*日?/u);
  if (yearFirst) {
    const year = Number(yearFirst[1]);
    const month = Number(yearFirst[2]);
    const day = Number(yearFirst[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return date.toISOString().slice(0, 10);
    }
    return undefined;
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return undefined;
  // Steam's English labels are calendar dates without a timezone. Preserve the parsed local
  // calendar components instead of converting local midnight to UTC, which can shift the day.
  const parsed = new Date(timestamp);
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseSearchPrice(
  combined: ReturnType<ReturnType<typeof load>>,
  query: ProviderQuery,
): GamePrice {
  const rawFinal = combined.attr('data-price-final');
  const rawOriginal = combined.attr('data-price-original');
  const finalMinor = integerValue(rawFinal);
  const originalMinor = integerValue(rawOriginal);
  const discountText = combined.find('.discount_pct').first().text();
  const discountMatch = discountText.match(/(\d{1,3})\s*%/u);
  const discountPercent = Math.min(100, Number(discountMatch?.[1] ?? 0));
  const combinedText = combined.text().replace(/\s+/gu, ' ').trim();
  const freeText = /\bfree\b|免費|免费|無料/iu.test(combinedText);
  const isFree = freeText || finalMinor === 0;

  if (finalMinor === undefined && !isFree) return emptyPrice();

  const normalizedFinal = finalMinor ?? 0;
  const finalFormatted = combined.find('.discount_final_price').first().text().trim() || undefined;
  const originalFormatted = combined.find('.discount_original_price').first().text().trim() || undefined;
  const currency = currencyFromFormatted(finalFormatted ?? originalFormatted, query.currency);
  const current = money(normalizedFinal, currency, finalFormatted);
  const original =
    originalMinor !== undefined
      ? money(originalMinor, currency, originalFormatted)
      : discountPercent === 0
        ? current
        : null;
  return { current, original, discountPercent, isFree };
}

function parseSearchGames(
  html: string,
  query: ProviderQuery,
  catalog: SteamTagCatalog,
  fetchedAt: string,
): Game[] {
  if (!html.trim()) return [];
  const $ = load(html);
  const rows = $('a.search_result_row');
  const games: Game[] = [];

  rows.each((_index, element) => {
    const row = $(element);
    const appIdRaw = row.attr('data-ds-appid');
    if (!appIdRaw || !/^\d+$/u.test(appIdRaw)) return;
    const name = row.find('.title').first().text().replace(/\s+/gu, ' ').trim();
    if (!name) return;

    const tagIds = parseTagIds(row.attr('data-ds-tagids'));
    const tags = uniqueStrings(tagIds.map((tagId) => catalog.byId.get(tagId)));
    const platformClasses = row
      .find('.platform_img')
      .toArray()
      .flatMap((node) => ($(node).attr('class') ?? '').split(/\s+/u));
    const platforms = uniqueStrings([
      platformClasses.includes('win') ? 'windows' : undefined,
      platformClasses.includes('mac') ? 'macos' : undefined,
      platformClasses.includes('linux') ? 'linux' : undefined,
    ]);
    const priceNode = row.find('.search_price_discount_combined').first();
    const releaseDate = normalizeReleaseDate(row.find('.search_released').first().text());
    const imageUrl = safeImageUrl(
      row.find('.search_capsule img').first().attr('src') ??
        row.find('.search_capsule img').first().attr('data-src'),
    );

    const game: Game = {
      id: appIdRaw,
      store: 'steam',
      name,
      url: `https://store.steampowered.com/app/${appIdRaw}`,
      developers: [],
      publishers: [],
      tags,
      genres: [],
      platforms,
      earlyAccess: tagIds.includes(EARLY_ACCESS_TAG_ID),
      mature: tagIds.some((tagId) => MATURE_TAG_IDS.has(tagId)),
      price: priceNode.length > 0 ? parseSearchPrice(priceNode, query) : emptyPrice(),
      source: { fetchedAt, provider: 'steam-store-search-experimental' },
      ...(imageUrl === undefined ? {} : { imageUrl }),
      ...(releaseDate === undefined ? {} : { releaseDate }),
    };
    games.push(game);
  });

  if (rows.length > 0 && games.length === 0) {
    throw schemaDrift('search', 'found result rows but none had the expected App ID and title fields');
  }
  return games;
}

export function parseSearchPage(
  payload: unknown,
  query: ProviderQuery,
  catalog: SteamTagCatalog,
  fetchedAt: string,
): ParsedSearchPage {
  const record = asRecord(payload);
  if (!record) throw schemaDrift('search', 'expected a JSON object');
  if (record.success !== 1 && record.success !== true) {
    throw schemaDrift('search', 'missing a successful response marker');
  }
  if (typeof record.results_html !== 'string') {
    throw schemaDrift('search', 'results_html is missing or is not a string');
  }
  const totalCount = integerValue(record.total_count);
  const games = parseSearchGames(record.results_html, query, catalog, fetchedAt);
  if ((totalCount ?? 0) > 0 && record.results_html.trim() && games.length === 0) {
    throw schemaDrift('search', 'Steam reported results, but the HTML contained no parseable games');
  }
  return { games, totalCount };
}

function recordNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.map((entry) => stringValue(asRecord(entry)?.name)));
}

function platformNames(value: unknown): string[] {
  const record = asRecord(value);
  if (!record) return [];
  return uniqueStrings([
    booleanValue(record.windows) ? 'windows' : undefined,
    booleanValue(record.mac) ? 'macos' : undefined,
    booleanValue(record.steamos_linux) ? 'linux' : undefined,
  ]);
}

function releaseDateFromUnix(value: unknown): string | undefined {
  const seconds = integerValue(value);
  if (seconds === undefined || seconds <= 0) return undefined;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString().slice(0, 10);
}

function assetUrl(assetsValue: unknown): string | undefined {
  const assets = asRecord(assetsValue);
  const format = stringValue(assets?.asset_url_format);
  const file = stringValue(assets?.header) ?? stringValue(assets?.main_capsule);
  if (!format || !file || !format.includes('${FILENAME}')) return undefined;
  const relative = format.replace('${FILENAME}', file).replace(/^\/+/, '');
  return safeImageUrl(new URL(relative, STEAM_ASSET_BASE).toString());
}

function storeBrowseTagIds(item: UnknownRecord): number[] {
  const direct = Array.isArray(item.tagids) ? item.tagids : [];
  const weighted = Array.isArray(item.tags)
    ? item.tags.map((entry) => asRecord(entry)?.tagid)
    : [];
  return [...new Set([...direct, ...weighted].map(integerValue).filter((id): id is number => id !== undefined))];
}

function choosePurchaseOption(value: unknown, gameName: string): UnknownRecord | undefined {
  if (!Array.isArray(value)) return undefined;
  const options = value.map(asRecord).filter((entry): entry is UnknownRecord => entry !== undefined);
  return (
    options.find(
      (option) =>
        stringValue(option.purchase_option_name) === gameName && !booleanValue(option.must_purchase_as_set),
    ) ??
    options.find(
      (option) => !booleanValue(option.must_purchase_as_set) && integerValue(option.included_game_count) === 1,
    ) ??
    options.find((option) => !booleanValue(option.must_purchase_as_set)) ??
    options[0]
  );
}

function storeBrowsePrice(item: UnknownRecord, query: ProviderQuery): GamePrice {
  if (booleanValue(item.is_free)) {
    const zero = money(0, query.currency.toUpperCase());
    return { current: zero, original: zero, discountPercent: 0, isFree: true };
  }
  const name = stringValue(item.name) ?? '';
  const option = choosePurchaseOption(item.purchase_options, name);
  if (!option) return emptyPrice();
  const currentMinor = integerValue(option.final_price_in_cents);
  const originalMinor = integerValue(option.original_price_in_cents) ?? currentMinor;
  const discountPercent = integerValue(option.discount_pct) ?? 0;
  if (currentMinor === undefined || currentMinor < 0 || originalMinor === undefined || originalMinor < 0) {
    return emptyPrice();
  }
  const formattedFinal = stringValue(option.formatted_final_price);
  const formattedOriginal = stringValue(option.formatted_original_price);
  const currency = currencyFromFormatted(formattedFinal ?? formattedOriginal, query.currency);
  return {
    current: money(
      currentMinor,
      currency,
      formattedFinal,
    ),
    original: money(
      originalMinor,
      currency,
      formattedOriginal,
    ),
    discountPercent: Math.max(0, Math.min(100, discountPercent)),
    isFree: false,
  };
}

function storeBrowseGame(
  item: UnknownRecord,
  query: ProviderQuery,
  catalog: SteamTagCatalog,
  fetchedAt: string,
): Game | undefined {
  const appId = integerValue(item.appid) ?? integerValue(item.id);
  if (appId === undefined || appId <= 0 || item.success === 0 || item.visible === false) return undefined;
  const name = stringValue(item.name);
  if (!name) throw schemaDrift('StoreBrowse', `App ${appId} is missing its name`);
  const tagIds = storeBrowseTagIds(item);
  const tags = uniqueStrings(tagIds.map((tagId) => catalog.byId.get(tagId)));
  const basicInfo = asRecord(item.basic_info);
  const release = asRecord(item.release);
  const releaseDate = releaseDateFromUnix(
    release?.steam_release_date ?? release?.original_release_date,
  );
  const imageUrl = assetUrl(item.assets);
  return {
    id: String(appId),
    store: 'steam',
    name,
    url: `https://store.steampowered.com/app/${appId}`,
    developers: recordNames(basicInfo?.developers),
    publishers: recordNames(basicInfo?.publishers),
    tags,
    genres: [],
    platforms: platformNames(item.platforms),
    earlyAccess: tagIds.includes(EARLY_ACCESS_TAG_ID),
    mature: tagIds.some((tagId) => MATURE_TAG_IDS.has(tagId)),
    price: storeBrowsePrice(item, query),
    source: { fetchedAt, provider: 'steam-store-browse-experimental' },
    ...(imageUrl === undefined ? {} : { imageUrl }),
    ...(releaseDate === undefined ? {} : { releaseDate }),
  };
}

export function parseStoreBrowseItems(
  payload: unknown,
  query: ProviderQuery,
  catalog: SteamTagCatalog,
  fetchedAt: string,
): Game[] {
  const response = asRecord(asRecord(payload)?.response);
  if (!response || !Array.isArray(response.store_items)) {
    throw schemaDrift('StoreBrowse', 'response.store_items is missing or is not an array');
  }
  return response.store_items
    .map((item) => {
      const record = asRecord(item);
      if (!record) throw schemaDrift('StoreBrowse', 'store_items contains a non-object entry');
      return storeBrowseGame(record, query, catalog, fetchedAt);
    })
    .filter((game): game is Game => game !== undefined);
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.map(stringValue));
}

function describedNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.map((entry) => stringValue(asRecord(entry)?.description)));
}

export function parseAppDetails(
  payload: unknown,
  appId: string,
  query: ProviderQuery,
  fetchedAt: string,
): Game | undefined {
  const entry = asRecord(asRecord(payload)?.[appId]);
  if (!entry) throw schemaDrift('appdetails', `missing top-level entry for App ${appId}`);
  if (entry.success !== true) return undefined;
  const data = asRecord(entry.data);
  if (!data) throw schemaDrift('appdetails', `App ${appId} is missing its data object`);
  const name = stringValue(data.name);
  if (!name) throw schemaDrift('appdetails', `App ${appId} is missing its name`);

  const isFree = booleanValue(data.is_free);
  const priceOverview = asRecord(data.price_overview);
  const currentMinor = integerValue(priceOverview?.final);
  const originalMinor = integerValue(priceOverview?.initial) ?? currentMinor;
  const currency = stringValue(priceOverview?.currency)?.toUpperCase() ?? query.currency.toUpperCase();
  const discountPercent = integerValue(priceOverview?.discount_percent) ?? 0;
  const zero = money(0, currency);
  const price: GamePrice = isFree
    ? { current: zero, original: zero, discountPercent: 0, isFree: true }
    : currentMinor === undefined || originalMinor === undefined
      ? emptyPrice()
      : {
          current: money(currentMinor, currency, stringValue(priceOverview?.final_formatted)),
          original: money(originalMinor, currency, stringValue(priceOverview?.initial_formatted)),
          discountPercent: Math.max(0, Math.min(100, discountPercent)),
          isFree: false,
        };

  const genres = describedNames(data.genres);
  const platforms = asRecord(data.platforms);
  const release = asRecord(data.release_date);
  const descriptors = asRecord(data.content_descriptors);
  const descriptorIds = Array.isArray(descriptors?.ids) ? descriptors.ids : [];
  const requiredAge = integerValue(data.required_age) ?? 0;
  const imageUrl = safeImageUrl(stringValue(data.header_image));
  const releaseDate = normalizeReleaseDate(stringValue(release?.date));
  return {
    id: appId,
    store: 'steam',
    name,
    url: `https://store.steampowered.com/app/${appId}`,
    developers: stringArray(data.developers),
    publishers: stringArray(data.publishers),
    tags: [],
    genres,
    platforms: uniqueStrings([
      booleanValue(platforms?.windows) ? 'windows' : undefined,
      booleanValue(platforms?.mac) ? 'macos' : undefined,
      booleanValue(platforms?.linux) ? 'linux' : undefined,
    ]),
    earlyAccess: genres.some((genre) => normalizeTagName(genre) === 'early access'),
    mature: requiredAge > 0 || descriptorIds.length > 0,
    price,
    source: { fetchedAt, provider: 'steam-appdetails-experimental-fallback' },
    ...(imageUrl === undefined ? {} : { imageUrl }),
    ...(releaseDate === undefined ? {} : { releaseDate }),
  };
}

export function parseWishlistAppIds(payload: unknown): string[] {
  const items = asRecord(asRecord(payload)?.response)?.items;
  if (!Array.isArray(items)) {
    throw schemaDrift('wishlist', 'response.items is missing or is not an array');
  }
  const ids = items.map((item) => integerValue(asRecord(item)?.appid));
  if (ids.some((id) => id === undefined || id <= 0)) {
    throw schemaDrift('wishlist', 'one or more wishlist entries have an invalid App ID');
  }
  return [...new Set(ids.map(String))];
}

/** Optional UI presentation; deliberately separate from the deterministic game pool. */
export interface SteamPresentation { description: string; images: string[]; developers?: string[]; publishers?: string[] }
export function parseAppPresentation(payload: unknown, appId: string): SteamPresentation {
  const entry = asRecord(asRecord(payload)?.[appId]);
  if (!entry || typeof entry.success !== 'boolean') throw schemaDrift('appdetails', 'Missing presentation result');
  if (!entry.success) return { description: '', images: [] };
  const data = asRecord(entry.data);
  if (!data) throw schemaDrift('appdetails', 'Missing presentation data');
  const html = load(stringValue(data.short_description) ?? '');
  html('script, style').remove();
  html('br').replaceWith(' ');
  const description = html.text().replace(/\s+/gu, ' ').trim();
  const screenshot = Array.isArray(data.screenshots) ? data.screenshots.map(item => safeImageUrl(stringValue(asRecord(item)?.path_full))).find(Boolean) : undefined;
  const images = [safeImageUrl(stringValue(data.header_image)), screenshot].filter((url): url is string => !!url);
  const developers = Array.isArray(data.developers) ? data.developers.filter((v): v is string => typeof v === 'string') : [];
  const publishers = Array.isArray(data.publishers) ? data.publishers.filter((v): v is string => typeof v === 'string') : [];
  return { description, images: [...new Set(images)], ...(developers.length ? { developers } : {}), ...(publishers.length ? { publishers } : {}) };
}

export function parsePresentationArtwork(payload: unknown, appId: string): string[] {
  const items = asRecord(asRecord(payload)?.response)?.store_items;
  if (!Array.isArray(items)) return [];
  const item = items.map(asRecord).find(item => String(item?.appid ?? item?.id) === appId);
  const assets = asRecord(item?.assets);
  const format = stringValue(assets?.asset_url_format);
  if (!format?.includes('${FILENAME}')) return [];
  return ['main_capsule_2x', 'main_capsule', 'header_2x', 'header'].flatMap(key => {
    const file = stringValue(assets?.[key]);
    if (!file) return [];
    const url = safeImageUrl(new URL(format.replace('${FILENAME}', file).replace(/^\/+/, ''), STEAM_ASSET_BASE).toString());
    return url ? [url] : [];
  });
}
