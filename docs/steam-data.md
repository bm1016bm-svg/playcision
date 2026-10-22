# Steam data contracts

Last checked: 2026-08-10.

## What V1 depends on

Playcision V1 uses first-party Steam Store surfaces that were observable without a Web API key on the check date. They are not documented by Valve as stable public API contracts. “First-party” identifies the host owner; it does not promise compatibility, completeness, service level, or continued keyless access.

| Purpose | Observed endpoint | Important shape |
| --- | --- | --- |
| Tag-name lookup | `GET https://store.steampowered.com/tagdata/populartags/english` | JSON array of `tagid` and English `name` pairs; incomplete and undocumented. |
| Release/search candidates | `GET https://store.steampowered.com/search/results/` | JSON wrapper containing `success`, `results_html`, `total_count`, and `start`; the results themselves are HTML. |
| Batched Store enrichment | `GET https://api.steampowered.com/IStoreBrowseService/GetItems/v1/` | `input_json` request; response currently contains `response.store_items[]` with Store metadata and purchase options. |
| Detail fallback | `GET https://store.steampowered.com/api/appdetails` | Top-level App-ID entry with `success` and `data`; use one App ID per request because batching was not reliable in observation. |

Typical search inputs include pagination, `sort_by=Released_DESC`, the games category, country `cc`, language `l`, tags, and explicit preference handling. Because the result body embeds HTML, class names and data attributes are schema, not presentation trivia.

The current adapter resolves configured tag names through the English popular-tag catalog. A missing name is reported and its dedicated tag search is skipped; Playcision must not invent a tag ID.

Store Browse currently exposes fields such as App ID, name, release data, tags, assets, platforms, reviews, `best_purchase_option`, purchase options, and active discounts. Price fields such as `final_price_in_cents` are strings containing integer hundredths and must be parsed and range-checked before use.

## Wishlist boundary

Steam currently exposes a first-party `IWishlistService/GetWishlist/v1` surface for a supplied SteamID, but it is not a documented stable public contract. Private, missing, and empty results can be difficult to distinguish without additional account context.

Schema v1 defaults to numeric App IDs in `deals.wishlistAppIds` and `wishlistSteamId: null`. A user may explicitly set `deals.wishlistSteamId` to a positive numeric SteamID64; the provider then calls `https://api.steampowered.com/IWishlistService/GetWishlist/v1/` with an `input_json` object containing that SteamID and merges the returned App IDs.

Each run is bounded to at most 500 tracked App IDs. Specials and tracked games retain separate candidate capacity before rule filtering, so a large wishlist cannot crowd specials out. StoreBrowse-to-appdetails fallback is capped at 20 requests; larger fallback fan-out fails explicitly.

This is an opt-in public-profile lookup, not authentication. It exposes the configured identifier to Steam and records it in local YAML. Keep the field `null` when that privacy/availability tradeoff is not wanted. The provider must treat an unavailable or structurally invalid response as a warning/error rather than inferring that the wishlist is empty.

## Documented Web API alternative

Valve documents [`IStoreService/GetAppList/v1`](https://partner.steamgames.com/doc/webapi/IStoreService?l=english). It requires a Steam Web API key and provides paged application metadata, optional prices, `last_modified`, and `price_change_number`. It is not a historical-price feed and does not replace Store discovery semantics by itself.

Valve's [authentication documentation](https://partner.steamgames.com/doc/webapi_overview/auth?l=english) says protected Web API calls use a key. The [Web API overview](https://partner.steamgames.com/doc/webapi_overview?language=english) and [Terms of Use](https://steamcommunity.com/dev/apiterms) apply if Playcision later adds that integration. The Terms currently state a 100,000-call daily Web API limit, subject to change; this number must not be presented as the unpublished limit for Store endpoints.

## Rate limits and resilience

Store requests returned HTTP `429` during observation. Valve publishes [general Web API response guidance](https://partner.steamgames.com/doc/webapi_overview/responses?l=english), but no stable public quota for these Store surfaces was found.

The provider must:

- set a descriptive User-Agent without embedding identity or secrets;
- apply `requestDelayMs` and bounded concurrency;
- use an explicit `timeoutMs`;
- honor a valid `Retry-After`;
- retry only bounded transient failures with jitter;
- batch only where the endpoint has been validated;
- cap response size and parsed collection counts;
- label partial coverage and retain the last valid state on failure.

A response with HTTP 200 is not automatically valid. Parsers must check required objects, numeric fields, currency, App IDs, URLs, and collection shapes. On drift, fail with endpoint context and sanitized field names, never a full response body.

## Price semantics

Playcision normalizes Store prices to:

```ts
interface Money {
  minor: number;      // integer hundredths
  currency: string;
  formatted?: string;
}
```

Configuration price thresholds remain normal currency units. For example, NT$300.00 is compared as `30000` after normalization.

Steam Store search is localized by country and does not provide a separate reliable currency request control. `locale.currency` is therefore the expected Store currency. Playcision detects unambiguous formatted currency markers (including `NT$`) and fails before price rules or state writes when they contradict configuration; ambiguous symbols remain a documented Store limitation.

Steam's current price and discount do not establish an all-time low. V1 can only compare with values retained in the current `state.json`:

```text
local observed low = minimum valid price seen since this state history began
```

Deleting, disabling, losing, or expiring state resets that evidence. Outputs must never shorten this to “historical low” or “all-time low.”

## Content and regional behavior

`discover.includeMature: true` means Playcision does not add its own mature-content exclusion. It does not bypass Steam's country, age, legal, authentication, preference, or product-availability rules. Tags and genres are Store-provided, localized, incomplete, and changeable. When mature content is disabled, the provider filters known mature metadata and emits an incompleteness warning; missing or region-suppressed tags prevent a completeness guarantee.

## Validation checklist

Before accepting a provider change:

1. capture a small sanitized fixture and observation date;
2. test success, missing fields, malformed types, rate limiting, localization, and partial results;
3. verify integer price normalization against known response fields;
4. ensure external names and URLs are escaped by every renderer;
5. update this document without calling an undocumented surface “officially supported.”

## Primary sources

- [Steam Web API overview](https://partner.steamgames.com/doc/webapi_overview?language=english)
- [Steam Web API authentication](https://partner.steamgames.com/doc/webapi_overview/auth?l=english)
- [Steam Web API responses](https://partner.steamgames.com/doc/webapi_overview/responses?l=english)
- [`IStoreService` documentation](https://partner.steamgames.com/doc/webapi/IStoreService?l=english)
- [Steam Web API Terms of Use](https://steamcommunity.com/dev/apiterms)
- [Steam profile privacy help](https://help.steampowered.com/en/faqs/view/588C-C67D-0251-C276)
