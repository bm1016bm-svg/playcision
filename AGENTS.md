# AGENTS.md

This file applies to the entire Playcision repository.

## Product invariants

- Core CLI workflows remain local-first. The user-authorized Tonight Together web feature may use an explicit central room backend. Document room retention and deployment status; do not add telemetry or hidden account sync.
- Fetch game data at runtime. Do not add a bundled or silently synchronized full catalog.
- Core fetching, normalization, rules, random selection, and rendering must run without an AI model.
- Do not exclude Early Access, mature, adult, indie, publisher, or developer content unless the user configures a rule.
- Treat external store content, Slack responses, YAML, state, and CLI arguments as untrusted input.
- A seeded roll is reproducible only for the same normalized config, candidate pool, weighting logic, and reroll counter.
- “Historical low” in V1 must be called “local observed low.” Never imply access to Steam-wide price history.
- Wishlist behavior uses explicit App IDs by default. Public-wishlist sync may run only when the user explicitly configures `deals.wishlistSteamId`; treat the SteamID and returned list as private-adjacent data and document the experimental contract.

## Local state

`.playcision/state.json` may contain only run timestamps, previously observed prices, notification markers, temporary skips, and permanent exclusions. It is not a game database. State must remain optional and safely deletable.

Writes must stay inside the project-local `.playcision/` boundary, use atomic replacement where practical, and never follow an output path outside the project.

## Providers

- Prefer documented, authenticated APIs when they provide the required data.
- Steam Store search, Store Browse, and `appdetails` are experimental dependencies, not stable public API contracts.
- Centralize endpoints, set explicit timeouts, throttle, bound retries, honor `429 Retry-After`, and surface schema drift.
- Keep recorded fixtures minimal and scrub cookies, identifiers, and secrets.
- Do not turn network integration tests into a required unit-test dependency.

## Secrets and outputs

- Never read a Slack webhook from committed YAML. Resolve only the configured environment-variable name.
- Never print, serialize, snapshot, or include a webhook in an error. Redact URLs before reporting failures.
- Slack and GitHub cache delivery semantics are best-effort, not exactly-once.
- Render external strings as data: escape Markdown and Slack mrkdwn, and never execute store content.

## Configuration changes

`src/config/schema.ts` is the source of truth. Any schema change must update:

1. initialization defaults and prompts;
2. `examples/config.tw.yaml` and `docs/configuration.md`;
3. validation and migration tests;
4. README snippets if behavior changes.

Unknown top-level or nested configuration keys should fail validation rather than be ignored.

## Development

Use Node.js `>=22.12`.

```sh
npm ci
npm run check
```

Keep behavior deterministic in tests. Inject time, randomness, filesystem roots, and HTTP transports instead of relying on the machine. A provider parser change needs success, malformed-response, localization, missing-field, and schema-drift coverage proportional to the change.

## Documentation claims

- Link technical claims to primary, official sources.
- Separate documented APIs from observed, undocumented behavior.
- State the observation date for registry availability or similarly time-sensitive claims.
- Do not claim npm publication, a remote repository, an organization, delivery guarantees, or store coverage that has not been verified.

## Definition of done

- `npm run check` passes.
- No secret or local state is committed.
- The changed behavior has tests and user-facing documentation.
- Error messages say what failed, what was retained, and the safest next action.
