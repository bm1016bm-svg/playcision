# Architecture

Playcision is a local process with live network adapters. It has no account service, central scheduler, recommendation backend, or synchronized game database.

## Runtime flow

```text
Local scheduler / GitHub Actions / person / coding agent
                         |
                         v
              CLI command / local Web UI
                         |
                         v
             Live Steam data provider
                         |
                         v
              In-memory normalization
                         |
                         v
        Rules + candidate pool + local state
              /          |          \
       Discover        Deals         Roll
              \          |          /
                         v
                     Renderer
              /          |          \
          terminal    Markdown      Slack
                         |
                    optional JSON
```

Every run starts from current configuration and live provider responses. Only the small state needed for observations and notification behavior survives.

The `ui` command adds a loopback-only HTTP surface over the same application services. `GET /api/digest` performs a dry-run digest, so opening or refreshing the page does not write files, notify Slack, or update notification markers. The only UI mutations are explicit temporary-skip and permanent-exclusion requests, validated by the same state service as the CLI. The Tonight shortlist lives only in React memory for the current page session.

## Components

### Configuration

`src/config/schema.ts` is a strict Zod schema. YAML is parsed into a normalized configuration before providers or output writers run. Unknown keys fail validation so typos do not silently change product behavior.

### Providers

A provider returns a store-neutral `Game` shape: Store ID, App ID, localized name, Store URL, release information, developers/publishers, tags/genres, platforms, content flags, normalized price, and fetch provenance.

The Steam adapter has three responsibilities:

1. fetch live release/search candidates;
2. enrich explicit App IDs and candidates with Store details;
3. identify schema drift instead of guessing.

Provider HTTP calls are the primary untrusted network boundary. See [Steam data contracts](steam-data.md).

### Rules

Discover filters recent releases using locale, interest, date, Early Access, and mature-content settings. Deals applies price and discount thresholds, explicit wishlist IDs, an optional explicitly configured public-wishlist sync, local observations, and notification state. Roll builds its pool first, then makes one uniform or weighted seeded choice.

Rules are deterministic for the same normalized input. Network results and time are obtained before the pure rule stage where practical.

### State

`.playcision/state.json` stores only:

- last-run timestamps;
- previously observed prices;
- notification fingerprints or markers;
- temporary skips;
- permanent exclusions.

State is optional, schema-versioned, project-local, and replaceable. It is not authoritative catalog data. Runs use a bounded cross-process lock so another command cannot silently overwrite newer skip, exclusion, price, or notification state. Old observations are pruned using `state.retentionDays`; a missing, deleted, or expired observation means a fresh history for that item.

### Renderers and delivery

Renderers receive one normalized digest and produce terminal, Markdown, JSON, or Slack representations. They escape external text for their target format. File outputs are restricted to distinct files under `.playcision/outputs/` and use atomic replacement. Slack retries explicit `429` responses only; ambiguous network failures are not retried automatically, and the webhook is never logged.

### Local Web UI

`src/ui/server.ts` serves the built React client and same-origin API. It binds to `127.0.0.1` by default, applies a restrictive browser security policy, rejects cross-origin state mutations, bounds JSON request bodies, and redacts URLs from API errors. `src/web/` contains the responsive swipe deck, explicit buttons and keyboard alternatives, session shortlist, details dialog, and live rule snapshot. Game images remain remote Steam assets fetched at display time; no catalog or image cache is bundled.

## Agent boundary

An agent may install the CLI, edit YAML, explain a result, or generate a scheduler file. Runtime data collection, normalization, rules, seeded random selection, and rendering do not require an AI model. An agent must show meaningful setting changes and must not move secrets into prompts or files.

## Reproducibility

A roll identity is a function of:

```text
seed + reroll counter + normalized config + ordered candidate pool + weighting algorithm
```

The same seed alone is insufficient. A price, catalog, exclusion, skip, configuration, or algorithm change can change the result. Output should include the selected game's reasons and enough non-secret metadata to explain the choice.

## Failure model

- Invalid configuration: fail before network or output mutation.
- Provider timeout, throttling, or schema drift: keep the last valid state and show an actionable warning/error.
- Renderer failure: do not silently claim delivery.
- Slack failure: report a redacted status and preserve retry/deduplication semantics as best-effort.
- Interrupted state write: preserve the last valid file through atomic replacement.
- GitHub cache miss: continue with fresh state and make the loss of observation history visible.

## Extension points

Later providers and renderers should implement the normalized boundaries rather than leak Store-specific fields into rules. Notion, RSS, MCP tools, and additional stores remain future work until code, tests, and documentation exist.
