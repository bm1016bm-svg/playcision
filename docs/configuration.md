# Configuration

Playcision reads `.playcision/config.yaml`. Schema version `1` is strict: unknown keys are rejected. Omitted known fields receive the defaults below.

The complete copyable example is [`examples/config.tw.yaml`](../examples/config.tw.yaml).

## Locale

| Field | Default | Constraint |
| --- | --- | --- |
| `version` | `1` | Literal `1`. |
| `locale.country` | `TW` | Two uppercase letters; intended as ISO 3166-1 alpha-2. |
| `locale.currency` | `TWD` | Three uppercase letters. |
| `locale.language` | `tchinese` | Non-empty string of at least two characters, passed to the provider. |

Locale controls requested Store localization. It does not guarantee availability or bypass Store restrictions.

## Steam provider

| Field | Default | Constraint |
| --- | --- | --- |
| `providers.steam.enabled` | `true` | Boolean. |
| `providers.steam.maxPages` | `2` | Integer `1..10`. |
| `providers.steam.requestDelayMs` | `350` | Integer `0..10000` milliseconds. |
| `providers.steam.timeoutMs` | `15000` | Integer `1000..60000` milliseconds. |

Increasing pages increases latency and Store requests. A zero delay is valid schema but may increase throttling risk.

## Interests

`interests.tags`, `genres`, and `developers` are arrays of trimmed, non-empty strings. `includeAppIds` and `excludeAppIds` are arrays of numeric strings.

Names are provider-facing and localization-sensitive. App IDs are more stable than names but still do not guarantee regional availability.

## Discover

| Field | Default | Constraint |
| --- | --- | --- |
| `discover.days` | `7` | Integer `1..365`. |
| `discover.limit` | `20` | Integer `1..100`. |
| `discover.includeEarlyAccess` | `true` | Boolean. |
| `discover.includeMature` | `true` | Boolean. |

No content category is silently excluded. Turning a flag off is a user rule, not a product judgment.

## Deals

| Field | Default | Constraint |
| --- | --- | --- |
| `deals.limit` | `20` | Integer `1..100`. |
| `deals.maxPrice` | `300` | Number `>=0` or `null` for no price ceiling. |
| `deals.minDiscountPercent` | `20` | Integer `0..100`. |
| `deals.localObservedLowOnly` | `false` | Boolean; requires retained state for meaningful history. |
| `deals.notifyPriceChanges` | `true` | Boolean. |
| `deals.wishlistAppIds` | `[]` | Numeric-string App IDs. |
| `deals.wishlistSteamId` | `null` | `null` or a numeric string of 1–20 digits; the provider requires a positive SteamID64. |

`maxPrice` is in `locale.currency` units. Provider price values are normalized internally as integer hundredths to avoid floating-point comparisons.

The price and discount thresholds are an OR rule. With the defaults, a candidate qualifies at `TWD 300` or less, or at a discount of at least `20%`. `maxPrice: null` disables the price side; `minDiscountPercent: 0` disables the discount side. Currency-mismatched prices are rejected before these comparisons.

Wishlist App IDs are explicit and need no account lookup. Setting `wishlistSteamId` is a separate, opt-in public-profile request through an undocumented Store surface. Keep it `null` to avoid that request. A configured SteamID becomes local preference data and may be visible to Steam and to anyone who can read the configuration.

## Roll

| Field | Default | Constraint |
| --- | --- | --- |
| `roll.limit` | `100` | Integer `1..500`. |
| `roll.maxPrice` | `null` | Number `>=0` or no ceiling. |
| `roll.tags` | `[]` | Trimmed, non-empty strings. |
| `roll.mode` | `weighted` | `uniform` or `weighted`. |
| `roll.weights.discounted` | `1.15` | Number `>0` and `<=10`. |
| `roll.weights.interestMatch` | `1.3` | Number `>0` and `<=10`. |
| `roll.weights.neverNotified` | `1.1` | Number `>0` and `<=10`. |

Weights are relative multipliers, not percentages. They affect selection only after the candidate pool is built.

## Outputs

| Field | Default | Constraint |
| --- | --- | --- |
| `outputs.markdown.enabled` | `true` | Boolean. |
| `outputs.markdown.path` | `.playcision/outputs/digest.md` | File path inside `.playcision/outputs/`. |
| `outputs.json.enabled` | `false` | Boolean. |
| `outputs.json.path` | `.playcision/outputs/digest.json` | A distinct file path inside `.playcision/outputs/`. |
| `outputs.slack.enabled` | `false` | Boolean. |
| `outputs.slack.webhookEnv` | `SLACK_WEBHOOK_URL` | Uppercase environment-variable name matching `[A-Z_][A-Z0-9_]*`. |

`webhookEnv` stores a variable name, never the secret value. The resolved webhook must use HTTPS on Slack's webhook hosts and `/services/` path.

## State

| Field | Default | Constraint |
| --- | --- | --- |
| `state.enabled` | `true` | Boolean. |
| `state.retentionDays` | `90` | Integer `1..3650`; old price and notification observations are pruned. |

State is optional. Disabling it removes persistent deduplication, price changes, local-observed lows, skips, and exclusions that are not also present in configuration. Retention bounds file growth; once an observation expires, it no longer proves a prior low or notification.

## Schedule

| Field | Default | Constraint |
| --- | --- | --- |
| `schedule.type` | `none` | `none`, `local`, or `github`. |
| `schedule.cron` | `0 9 * * *` | Exactly five whitespace-separated fields. |
| `schedule.timezone` | `Asia/Taipei` | IANA time-zone name accepted by the runtime. |

Schema validation checks the five-field shape, not every scheduler's dialect. Review generated scheduler files before installing them. GitHub Actions currently supports a `timezone` entry for scheduled events; local schedulers may use the OS time zone or their own syntax.

## Secret setup

Local shell:

```sh
export SLACK_WEBHOOK_URL='https://hooks.slack.com/services/...'
```

PowerShell:

```powershell
$env:SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/...'
```

Those commands affect the current process only. Do not paste the value into screenshots, issue reports, `config.yaml`, `state.json`, `secrets.example`, or a scheduled task command line. Use the scheduler platform's protected secret mechanism for unattended runs.
