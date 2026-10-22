# Contributing

Playcision welcomes focused fixes and small, reviewable improvements. The project is local-first and deliberately avoids a central account or data service.

## Setup

Node.js `>=22.12` is required.

```sh
npm ci
npm run check
```

For command development:

```sh
npm run dev -- doctor
npm run dev -- digest
```

## Change rules

- Keep commits scoped; do not mix generated formatting, dependency churn, and behavior changes.
- Add tests for new rules, parser branches, state transitions, and output escaping.
- Use recorded, scrubbed fixtures for Store response parsing. Unit tests must not require live Steam or Slack.
- Preserve user data on failure. State writes should be atomic and recoverable.
- Never add a default content-value judgment. Early Access and mature content remain included unless configured otherwise.
- Call V1 price history “local observed low,” never “all-time low.”
- Document experimental Store dependencies as undocumented and unstable.

Before proposing a change, run:

```sh
npm run check
```

The CI matrix checks Node.js 22 and 24 on Linux, Windows, and macOS.

## Configuration changes

The strict schema in `src/config/schema.ts` is the contract. Update initialization, examples, documentation, and tests together. Do not silently accept unknown fields or invent undocumented migration behavior.

## Provider changes

Include the endpoint owner, official documentation if any, observation date for undocumented behavior, request/response fixture, rate-limit handling, timeout behavior, and schema-drift failure mode. A first-party hostname does not make an endpoint a supported public API.

## Security

Do not include credentials, webhook URLs, private profiles, cookies, or raw user state in issues, fixtures, logs, or screenshots. Follow [SECURITY.md](SECURITY.md) for private reporting and assessment scope.

## Documentation

Use primary sources for technical claims. If behavior is inferred from an observed response, label it as observed rather than guaranteed. Keep English and Traditional Chinese README behavior claims aligned.

This documentation does not assert that a public remote repository or npm package is available; choose the contribution delivery channel only after the maintainer publishes one.
