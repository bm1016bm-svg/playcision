# CLI reference

The examples use a linked `playcision` executable. From a source checkout, replace `playcision` with `node dist/cli.js` after `npm run build`, or use `npm run dev --` during development.

Global controls:

| Option | Meaning |
| --- | --- |
| `--cwd <path>` | Select the project directory containing `.playcision/`. |
| `--plain` | Disable ANSI color. `NO_COLOR` is also respected by rendering. |
| `--version` | Print the CLI version. |

## `ui`

```sh
playcision ui --open
```

Starts the local swipe-first dashboard. The production command serves the bundled UI and a same-origin JSON API from the same process. It binds to `127.0.0.1:4173` by default; use `--port` to change the port. `--host 0.0.0.0` is intentionally opt-in and prints a privacy warning because reachable devices could view local game preferences.

The initial payload is a dry-run digest, so loading or refreshing the UI does not write outputs, notification markers, or Slack messages. Explicit seven-day skip and permanent-exclude actions do update the allowed state fields. `--dev` enables Vite middleware and is intended for source development; `npm run dev:ui` is its shortcut.

## `init`

```sh
playcision init
```

Creates `.playcision/` after asking for:

1. country, expected Store currency, and Steam language;
2. tags, genres, developers, and explicit tracked App IDs;
3. explicit wishlist App IDs and an optional public SteamID64;
4. discovery window, Early Access/adult inclusion, deal price/discount rules, and local-observed-low mode;
5. Markdown, JSON, and Slack outputs;
6. no schedule, local scheduler instructions, or a GitHub Actions workflow, including cron and IANA timezone.

Initialization must avoid overwriting an existing configuration without an explicit user decision. It writes a secret example with a placeholder, never a live webhook.

`--yes` uses schema defaults without prompts. `--force` regenerates generated configuration/templates only after the caller reviews that consequence; an existing `state.json` is preserved and must be deleted explicitly to reset history.

## `discover`

```sh
playcision discover
```

Fetches live Steam candidates, normalizes them in memory, applies `interests` and `discover` rules, then renders a current result. Early Access and mature content are included unless the user disables them.

Discovery is not an exhaustive catalog crawl. Results are bounded by `providers.steam.maxPages` and `discover.limit` and by what the experimental Store surface returns.

`--format <format>` chooses `terminal`, `markdown`, or `json`. `--limit <count>` (or `-n`) trims displayed results after the configured rules run.

## `deals`

```sh
playcision deals
```

Combines live candidate prices with:

- `deals.maxPrice`;
- `deals.minDiscountPercent`;
- `deals.wishlistAppIds`;
- `deals.wishlistSteamId` when the user explicitly opts into public-wishlist sync;
- `deals.notifyPriceChanges`;
- `deals.localObservedLowOnly`;
- prior state when enabled.

Explicit App IDs are the default. When `wishlistSteamId` is non-null, Playcision queries the experimental public-wishlist surface and merges its App IDs for that run. This can reveal which public account is being tracked in local configuration and network metadata; private, empty, missing, and unavailable results may be indistinguishable. “Local observed low” is scoped to this state file. With state disabled or lost, price-change and deduplication history is unavailable.

When both thresholds are enabled, a candidate passes when its price is at or below `maxPrice` **or** its discount is at or above `minDiscountPercent`. Set `maxPrice: null` or `minDiscountPercent: 0` to disable that side of the OR rule.

`--format <format>` chooses `terminal`, `markdown`, or `json`. `--limit <count>` (or `-n`) trims displayed results.

## `roll`

```sh
playcision roll
playcision roll --seed friday-night
playcision roll --seed friday-night --reroll 1
```

Roll first builds a candidate pool using platform availability, configured interests, price, tags, state exclusions, and temporary skips. It then uses `roll.mode`:

- `uniform` gives every candidate the same selection weight;
- `weighted` applies the configured `discounted`, `interestMatch`, and `neverNotified` multipliers.

Confirmed controls:

| Option | Meaning |
| --- | --- |
| `--seed <text>` | Supply a stable input seed. |
| `--reroll <counter>` | Use a non-negative, zero-based reroll counter; the default is `0`. |
| `--format <format>` | Choose `terminal`, `markdown`, or `json`. |
| `--skip <appid> --skip-days <days>` | Temporarily remove an App ID for `1..3650` days; the default is seven. |
| `--unskip <appid>` | Remove a temporary skip. |
| `--exclude <appid>` | Persistently remove an App ID until configuration/state is changed. |
| `--include <appid>` | Undo a state-level permanent exclusion. |
| `--installed` | Add games found in local Steam library manifests to the candidate pool. |
| `--open-store` | Open the selected game's HTTPS Steam Store page. |
| `--launch` | In an interactive non-CI session, ask the local Steam client to run the selected App ID. |

Only numeric App IDs may become URLs or `steam://rungameid/` targets. `--launch` is refused in CI or a non-interactive process.
`--open-store` and `--launch` are mutually exclusive.

The same seed reproduces the same result only when the normalized configuration, ordered candidate pool, weighting algorithm, and reroll counter are also unchanged.

## `digest`

```sh
playcision digest
```

Runs Discover, Deals, and Roll as one snapshot, then writes enabled Markdown/JSON outputs and optionally delivers Slack.

| Option | Meaning |
| --- | --- |
| `--notify` | Deliver enabled notification sinks such as Slack. Without it, Slack is not sent. |
| `--dry-run` | Print without writing file outputs, state, or notifications. |
| `--no-roll` | Omit Roll from this digest. |
| `--format <format>` | Choose `terminal`, `markdown`, or `json`; terminal is the default. |

File output success and Slack delivery success are separate facts. Slack is best-effort and is not an exactly-once queue.

## `doctor`

```sh
playcision doctor
```

Checks Node.js, schema v1, `.playcision/` writability, state version, project-confined output paths, Slack webhook presence/shape with the value redacted, generated schedule consistency, and Steam reachability when a provider check is available.

`--offline` skips the Steam network diagnostic. `--json` emits an agent-readable JSON report.

## Output and automation rules

- Interactive commands may use restrained color; `NO_COLOR` disables it.
- Machine-readable output must not contain banners or ANSI codes.
- Commands must not print secrets, cookies, raw state, or complete failed HTTP bodies.
- A scheduler must use an explicit working directory.
- A failure must not update notification state as though delivery succeeded.
