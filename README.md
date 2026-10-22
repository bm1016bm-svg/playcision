<p><img src="public/brand/wordmark-bilingual.png" width="394" alt="Playcision／遊豫不決" /></p>

> Stop browsing. Start playing.  
> 別選了，開始玩。  
> Game of Throws / 擲戲之王

Playcision is a local-first, agent-native game intelligence program with a CLI and local web UI. It fetches live store data only when a command runs, applies rules from a local YAML file, and produces a discovery list, deal report, or reproducible game roll.

No account, central backend, telemetry, or preloaded game database is required. Codex, Claude Code, or another coding agent can install it and edit the same plain files a person can inspect.

[繁體中文說明](README.zh-TW.md)

## Status

This repository is an active V1 source build: [bm1016bm-svg/playcision](https://github.com/bm1016bm-svg/playcision). The website is not publicly deployed yet; npm publication is separate from this source release.

Creator: [@bm1016bm-svg](https://github.com/bm1016bm-svg). Follow the author or star this repository to support development. The web UI includes optional coffee support; hosted ECPay checkout remains disabled until the author configures verified payment links. See [setup and indie pilot proposal](docs/support-and-indie-pilot.md).

`npm view playcision` returned `E404` on 2026-08-10. That only means the registry returned no package at that moment; it does not reserve the name or guarantee future availability. The intended `npx playcision init` flow becomes valid only after a package is actually published.

## V1 scope

- TypeScript CLI and strict YAML configuration
- Local swipe UI with keyboard and button alternatives
- Live Steam discovery and price data
- New/recent release rules, including Early Access and mature content by default
- Price thresholds, discount thresholds, local-observed lows, and notification deduplication
- Uniform or weighted, seeded game rolls
- Markdown, JSON, terminal, and Slack rendering
- Local schedulers or GitHub Actions
- Small, optional local state

Notion, RSS, MCP, and additional stores are later integrations, not V1 promises.

## Run from source

Node.js `>=22.12` is required.

```sh
npm ci
npm run build
node dist/cli.js init
node dist/cli.js doctor
node dist/cli.js digest --dry-run
node dist/cli.js ui --open
```

For local development, use `npm run dev -- <command>`. If you intentionally run `npm link`, the same interface is available as `playcision <command>`.

## Command surface

| Command | Purpose |
| --- | --- |
| `playcision init` | Create `.playcision/` and guide locale, interests, rules, outputs, and scheduling. |
| `playcision ui` | Start the loopback-only swipe dashboard. |
| `playcision discover` | Fetch matching new and recent Steam releases. |
| `playcision deals` | Evaluate live prices, discounts, explicit wishlist App IDs, an optional public-wishlist sync, and local state. |
| `playcision roll` | Build a candidate pool and choose one game using uniform or weighted randomness. |
| `playcision digest` | Run discovery, deals, and a roll, then render configured outputs; add `--notify` to deliver Slack. |
| `playcision doctor` | Validate configuration, local paths, provider reachability, and output prerequisites. |

Roll controls include `--seed <text>`, `--reroll <counter>`, `--skip <appid> --skip-days <days>`, `--exclude <appid>`, `--open-store`, and `--launch`. A seed is reproducible only with the same normalized configuration, candidate pool, weighting rules, and reroll counter. Live catalog changes can therefore change a later result.

See [CLI reference](docs/cli.md).

## Local UI

Run `playcision ui --open`. The dashboard binds to `127.0.0.1:4173` by default, performs a dry-run digest, and turns live Discover, Deals, and Roll results into swipe cards. Swipe left to pass, right to add a game to the in-memory Saved list; arrow keys and visible controls provide the same actions, and Backspace undoes the last choice. Seven-day skips and permanent exclusions are explicit state mutations; the Saved list is session-only. Use `npm run dev:ui` for UI development.

## Configuration

The complete V1 example is [`examples/config.tw.yaml`](examples/config.tw.yaml). It follows `src/config/schema.ts` exactly.

```yaml
deals:
  maxPrice: 300
  minDiscountPercent: 20
  localObservedLowOnly: false
  wishlistAppIds:
    - "413150"
  wishlistSteamId: null

outputs:
  slack:
    enabled: true
    webhookEnv: SLACK_WEBHOOK_URL
```

`maxPrice` is expressed in the configured currency unit. Internally, Steam prices are normalized from integer hundredths; for example, NT$300.00 is `30000` in that normalized representation.

Price and discount are an OR rule: by default a candidate qualifies at TWD 300 or less, or at 20% off or better. `maxPrice: null` and `minDiscountPercent: 0` disable their respective sides. A detected Store/config currency mismatch fails before price rules run.

V1 uses explicit Steam App IDs in `deals.wishlistAppIds` by default. A user may explicitly set `deals.wishlistSteamId` to a public numeric SteamID64; Playcision then queries the experimental keyless `IWishlistService` surface and merges returned App IDs. Private, empty, missing, and unavailable wishlists may be indistinguishable, and no wishlist sync is attempted when the field is `null`.

## Local files and privacy

```text
.playcision/
├── config.yaml
├── state.json
├── secrets.example
├── outputs/
├── templates/
└── AGENTS.md
```

`state.json` is not a game database. It stores only run timestamps, observed prices, notification markers, temporary skips, and permanent exclusions. History defaults to 90 days, and a local lock serializes stateful commands. Disable state to avoid persistence, or delete it to reset history. Doing so also removes deduplication, price-change history, local-observed lows, and persistent skips.

Output paths are project-local. Slack webhook values belong in environment variables or a scheduler secret store, never in `config.yaml`, state, committed files, command-line arguments, or logs.

Read [privacy and security](docs/privacy-security.md) and [the security policy](SECURITY.md).

## Data honesty

Steam's search, Store Browse, and `appdetails` Store endpoints used by V1 are first-party and currently observable without a Web API key, but Valve does not publish them as stable public contracts. HTML/JSON shape, availability, content, and throttling can change. Playcision must validate responses, throttle requests, retry bounded transient failures, and fail with an actionable schema-drift warning.

“Local observed low” means the lowest price this specific state file has seen since tracking began. It is not an all-time Steam historical low.

Steam can still apply regional, legal, age, authentication, and availability restrictions. Enabling mature content does not bypass them.

See [Steam data contracts](docs/steam-data.md).

## Scheduling and delivery

[Scheduling guide](docs/scheduling.md) covers Windows Task Scheduler, Linux cron, macOS launchd, and GitHub Actions. A ready-to-copy workflow is in [`examples/github-actions/daily-digest.yml`](examples/github-actions/daily-digest.yml).

GitHub-hosted runners are ephemeral. The example restores and saves `state.json` through Actions cache, which is best-effort and may be evicted or unavailable. Scheduled runs can be delayed or dropped under load. Slack delivery and deduplication are also best-effort, not exactly-once.

## Interface direction

The default local UI uses Inter, dark blue glass navigation, high-contrast text and a restrained lime accent. Steam artwork stays in a complete 16:9 frame. Skip and Save are the main decisions; tap a card for details. There is no simulated phone frame or operating-system chrome.

- `/` and `/?consumer=1`: consumer interface; `/?lab=1`: design experiments; `/?legacy=1`: former interface.
- Left/right swipes or arrow keys skip/save; Backspace or the undo button reverses a session decision.
- Collections are session-only, labeled “本次收藏”; a page reload clears them. Filters and immediate skips also live in this session.
- Details use the existing local API for seven-day skips and permanent exclusions. Those IDs remain hidden after reload. Failed writes retain the game and offer retry.
- The Steam tab opens the installed Steam client library or the store. It does not read or claim ownership of games.
- Provider contract notes are available under Steam → 資料來源. Request failures appear beside the affected operation.

See [design language](docs/design-language.md) and [UI verification](design-qa.md). The CLI and its `NO_COLOR` behavior are unchanged.

## Primary references

- [Steam Web API overview](https://partner.steamgames.com/doc/webapi_overview?language=english)
- [Steam Web API authentication](https://partner.steamgames.com/doc/webapi_overview/auth?l=english)
- [Steam Web API response and 429 guidance](https://partner.steamgames.com/doc/webapi_overview/responses?l=english)
- [Steam Web API Terms of Use](https://steamcommunity.com/dev/apiterms)
- [Slack incoming webhooks](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks)
- [GitHub Actions scheduled events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

## License

[MIT](LICENSE)

## 邀請制網頁內測版

內測版使用獨立 Node 網站入口、瀏覽器收藏與持久房間；與個人 CLI 設定隔離。本次未部署外網。部署、保留期限與回滾方式見 [內測版交付](docs/beta-release.md)，發出邀請前請完成 [驗收表](docs/beta-acceptance.md)。
