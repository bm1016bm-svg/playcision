# Security Policy

## System and scope

Playcision includes a local TypeScript CLI, a React frontend and an invitation-gated Node beta server. The covered boundary includes CLI arguments, YAML configuration, Steam responses, rules and rendering, local state/output, Slack delivery, URL launch, generated scheduler workflows, HTTP authentication/origin checks and shared room persistence.

There is no account service. Tonight Together uses a central Node room backend in beta; the alternate Cloudflare Worker public entry is disabled until verified admission and shared resource quotas exist. Protected assets include invitation/session secrets, anonymous room tokens and private votes, Slack webhooks, local state, filesystem integrity and process availability.

No packaged release channel is asserted in this repository. Until releases exist, only the current source version is considered for security fixes.

## Threat model and trust boundaries

The local OS user and explicitly selected project directory are trusted. These inputs are untrusted:

- Steam HTML, JSON, text, asset URLs, prices, and rate-limit responses;
- Slack HTTP responses;
- copied or agent-edited YAML and state JSON, including an optional public SteamID64;
- CLI arguments, seeds, App IDs, paths, locale values, and environment values;
- restored GitHub Actions caches and third-party action outputs.

Trust boundaries exist at every HTTP response, environment-variable lookup, configuration/state parse, rendered output, filesystem path resolution, URL launch, and scheduler handoff.

## Security invariants

- A configured output or state path must not escape the selected project boundary through `..`, absolute paths, links, or platform path quirks.
- State replacement must not corrupt the last valid file after interruption.
- Only numeric Steam App IDs may become Store or `steam://rungameid/` targets; external response text must never become an executable command.
- HTTP calls require HTTPS, bounded sizes and timeouts, bounded retries, and explicit response validation.
- Steam schema drift must fail closed with an actionable error, not silently reinterpret fields.
- Slack delivery may only use an HTTPS `hooks.slack.com` or `hooks.slack-gov.com` `/services/` URL obtained from the configured environment variable.
- Webhooks, cookies, tokens, and authorization values must never enter configuration, state, output, logs, exceptions, snapshots, fixtures, or process arguments.
- External text must be escaped for terminal, Markdown, JSON, and Slack contexts.
- State and caches must not be treated as trusted code or as authorization.

## Reportable findings and severity context

Privately report realistic paths to arbitrary command execution, project-boundary file read/write, webhook or private-state disclosure, unsafe URL launch, cache poisoning that crosses a trust boundary, unbounded remote resource consumption, response parsing that changes security-sensitive meaning, or secret exposure in CI.

Severity depends on reachability and impact. A remotely triggerable command or arbitrary-file primitive is higher concern than a local configuration error requiring the same OS-user privileges. Availability-only Store drift is normally lower concern, but becomes security-relevant if it bypasses an invariant above.

## Known limitations and accepted operating risk

- V1 depends on first-party Steam Store endpoints that Valve does not document as stable public contracts. Schema drift, `429` responses, regional variation, and temporary outages are expected operational risks; unsafe handling of them is still reportable.
- “Local observed low” is limited to the retained local state and is not global historical-price evidence.
- Slack delivery, notification deduplication, GitHub scheduled execution, and Actions-cache persistence are best-effort, not exactly-once or durable guarantees.
- Disabling or deleting state intentionally removes deduplication and observation history.
- Launching an installed Steam game hands control to the locally installed Steam client.

These limitations are not blanket exclusions. A finding remains reportable when it produces a concrete confidentiality, integrity, or realistic resource-exhaustion impact.

## Out of scope

The following are not vulnerabilities by themselves:

- Steam, Slack, GitHub Actions, Node.js, or an OS being unavailable;
- normal regional, age, legal, account, or store-catalog restrictions;
- a result changing because the live candidate pool changed;
- cache eviction, delayed scheduled jobs, or duplicate Slack delivery without an additional security impact;
- price correctness beyond the validated source response and documented local-observation semantics.

Third-party platform vulnerabilities should be reported to their owner unless Playcision makes them exploitable across its own boundary.

## Reporting

Do not publish a suspected vulnerability or include a live webhook, cookie, user state, or exploit payload in a public channel. Because no public repository or security contact is asserted here, use a private maintainer channel you already trust. If no such channel is available, retain the report without secrets until a private contact is published.

Include the affected source version, operating system, minimal reproduction with sanitized values, expected invariant, actual impact, and suggested mitigation if known. Maintainers should acknowledge through that same private channel, reproduce without requesting live credentials, and coordinate disclosure only after a fix is available.
