# Privacy and security

## Data inventory

Playcision is designed to process:

- user-authored locale, interests, rules, explicit Steam App IDs, an optional public SteamID64, and output settings;
- public Store responses fetched during a command;
- run timestamps, observed prices, notification markers, temporary skips, and exclusions;
- a Slack webhook supplied through an environment variable when enabled;
- browser-local favorites and collection folders;
- temporary multiplayer room membership, proposals and votes when the player uses Tonight Together.

It does not require a Playcision account, central profile, analytics identifier, or complete local game catalog. It does not need an AI model at runtime.

## Network destinations

V1 network behavior is limited to configured functionality:

- first-party Steam Store/API hosts for live game information;
- Slack's webhook host when Slack output is enabled;
- the same-origin room backend when multiplayer is used (or an operator-configured `VITE_ROOM_API` backend);
- GitHub only when the player follows the creator credit link;
- PAYUNi hosted checkout only when collection is released and the player clicks a support amount;
- GitHub Actions infrastructure only when the user places and runs a workflow in a repository.

An installer agent may use package registries or source hosting, but that is installation behavior rather than the Playcision runtime data path. Review lockfile and dependency changes before installation.

When `deals.wishlistSteamId` is non-null, a run sends that identifier to Steam's experimental wishlist service. The identifier remains in local YAML and can identify the public account being tracked. Keep it `null` and use `wishlistAppIds` when account-level disclosure is unnecessary. A private or unavailable profile may not be distinguishable from an empty result.

## Local state

`.playcision/state.json` is small behavioral memory, not catalog storage. It is optional and can be deleted to reset the product. Back it up first if local price observations or deduplication matter.

`state.retentionDays` bounds price and notification history, and `state.json.lock` serializes stateful commands. A stale lock is recoverable after the bounded stale interval; active lock contention fails with an explicit timeout instead of overwriting another run.

When state is disabled, deleted, expired, lost from Actions cache, or invalid:

- previous price comparisons are unavailable;
- local-observed-low history restarts;
- prior notification deduplication cannot be proven;
- temporary skips and state-only exclusions disappear.

The CLI must surface that condition instead of pretending it retained history.

## Browser and multiplayer storage

Favorites and collection folders remain in browser storage; clearing that storage removes them. They are not automatically synchronized to a central account. A room member token is held in sessionStorage and sent to the room backend for membership authorization.

Local UI rooms are in memory. Invitation beta stores rooms in `<BETA_DATA_DIR>/.playcision/rooms.json`; members receive filtered room views, not other members' tokens or unfinished votes. Room access expires after ten minutes. The beta cleanup timer runs every minute, so disk removal is not an exact ten-minute deadline. Invalid room snapshots can be preserved in private `rooms.quarantine-*.json` files for operator recovery; these exceptions require manual deletion and are not covered by room expiry. Do not include room snapshots in public backups or logs. See [room deployment and retention](rooms.md).

The Cloudflare web entry is public, without invitation authentication, accounts or login cookies. It retains same-origin checks, a fixed shared quota coordinator and SQLite room Durable Objects. Room actions and private views still require room membership authorization. Room access ends ten minutes after creation; an alarm deletes the object storage, subject to platform scheduling delays. The coordinator keeps bounded daily counters and short-lived room IDs, without member tokens or IPs. Favorites and exclusions stay in the browser. See [Cloudflare deployment and external acceptance](cloudflare-release.md); local runtime verification does not assert a deployed public service or production CPU/quota validation.

## Slack webhook

Slack describes an incoming webhook URL as a secret. Use only the environment-variable name in YAML:

```yaml
outputs:
  slack:
    enabled: true
    webhookEnv: SLACK_WEBHOOK_URL
```

The actual value must:

- be resolved at runtime;
- use HTTPS on `hooks.slack.com` or `hooks.slack-gov.com` with a `/services/` path;
- never be printed, logged, serialized, cached, placed in a prompt, passed on a command line, or committed;
- be rotated in Slack if exposed.

Slack [incoming webhook documentation](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks) notes that the channel, username, and icon inherit the app configuration and cannot be overridden per message. Webhook messages cannot be deleted through the incoming webhook interface.

Slack documents a general incoming-webhook rate of about one message per second and returns `429` with `Retry-After` when limited; see [rate limits](https://docs.slack.dev/apis/web-api/rate-limits/). Playcision sends one bounded digest and retries explicit `429` responses only. It does not retry network failures where Slack may already have accepted the message.

Slack Block Kit currently permits up to 50 blocks per message, and section text is limited to 3,000 characters; see [blocks](https://docs.slack.dev/reference/block-kit/blocks/) and [section blocks](https://docs.slack.dev/reference/block-kit/blocks/section-block/). Renderers must truncate visibly rather than create an invalid request.

## Optional creator support

The coffee-support UI opens an allowlisted PAYUNi reusable hosted checkout only after collection is explicitly released and a user clicks a configured amount. Validation pins the production host, observed checkout path and Playcision merchant identifier. Playcision does not collect card details, create payment orders, store donor records, or claim a successful payment from a click or return navigation. PAYUNi handles its own checkout data and payment records. GitHub support links similarly open only on user action. These outbound links use `noopener noreferrer`. Public `VITE_PAYUNI_*_URL` settings and the `VITE_PAYUNI_COLLECTION_ENABLED` release switch are embedded in the client build and must never contain credentials. The switch defaults to disabled; setting it is an operator release decision, not proof of approval. Invalid links disable their corresponding option; duplicate links disable all tiers. No advertising analytics, payment polling or new tracking are enabled. Merchant and all three payment pages were still pending PAYUNi review on 2026-10-29; see [collection status and release checks](support-and-indie-pilot.md).

## External text handling

Game names, descriptions, tags, developer names, URLs, and formatted prices are untrusted. Renderers escape them for terminal, Markdown, JSON, and Slack contexts. Store data must never be inserted into a shell command. Only validated numeric App IDs may be used for Store or Steam launch URLs.

## Delivery guarantees

Markdown/JSON writes can be atomic on a local filesystem, but Slack and GitHub Actions are distributed services. A successful HTTP response can be followed by a failed state save; a retry can then duplicate a message. V1 explicitly provides best-effort deduplication, not exactly-once delivery.

## Agent use

A coding agent may inspect configuration and propose a diff. It should not request that a webhook be pasted into chat, infer interests from unrelated local files, upload state for analysis, install a scheduler without showing it, or silently add content filters.

## Reset and removal

To stop collection, disable the scheduler first. Then disable `state.enabled` or remove `.playcision/state.json` after deciding whether its local observation history needs a backup. Remove the Slack secret from its environment or platform secret store separately; deleting configuration does not revoke a webhook.

Security assessment scope and private reporting are defined in [SECURITY.md](../SECURITY.md).
