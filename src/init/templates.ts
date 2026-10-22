import type { PlaycisionConfig } from '../config/schema.js';

export const secretsExample = `# Copy values into your shell, .env loader, or GitHub Actions secrets.
# Never commit the real webhook URL.
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/REPLACE/ME/LOCALLY
`;

export const localAgentsGuide = `# Playcision agent instructions

This directory is generated configuration, not a game database.

- Read \`.playcision/config.yaml\` before changing preferences.
- Run \`playcision doctor --offline\` after editing configuration.
- Run \`playcision digest --dry-run\` before enabling notifications.
- Never write secrets into config.yaml, state.json, Markdown, JSON, logs, or prompts.
- Slack uses the environment variable named by \`outputs.slack.webhookEnv\`.
- Keep state.json minimal. It may only hold run timestamps, price memory, notification fingerprints, temporary skips, and permanent exclusions.
- Do not silently add filters. Early access, adult content, indies, and major publishers are included unless the user explicitly excludes them.
- Treat Steam Store adapters as experimental public-data adapters; do not claim complete coverage.
- “Local observed low” means the lowest price seen since this local state began. It is not Steam-wide price history.
`;

export const digestTemplate = `# {{title}}

> Stop browsing. Start playing. / 別選了，開始玩。

{{discover}}

{{deals}}

{{roll}}
`;

export function githubWorkflow(config: PlaycisionConfig): string {
  const envBlock = config.outputs.slack.enabled
    ? `        env:\n          ${config.outputs.slack.webhookEnv}: \${{ secrets.${config.outputs.slack.webhookEnv} }}\n`
    : '';
  return `name: Playcision daily digest

on:
  workflow_dispatch:
  schedule:
    - cron: "${config.schedule.cron.replaceAll('"', '')}"
      timezone: "${config.schedule.timezone.replaceAll('"', '')}"

permissions:
  contents: read

concurrency:
  group: playcision-digest
  cancel-in-progress: false

jobs:
  digest:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm
      - name: Install and build checked-out source
        run: |
          npm ci
          npm run build
      - name: Restore best-effort local state
        uses: actions/cache/restore@v5
        with:
          path: .playcision/state.json
          key: playcision-state-\${{ github.run_id }}
          restore-keys: |
            playcision-state-
      - name: Build and deliver digest
        run: node dist/cli.js digest --notify
${envBlock}      - name: Save best-effort local state
        if: success()
        uses: actions/cache/save@v5
        with:
          path: .playcision/state.json
          key: playcision-state-\${{ github.run_id }}
`;
}

export function localScheduleGuide(config: PlaycisionConfig): string {
  return `# Playcision local schedule (review before installing)

# POSIX cron (Linux/macOS), running this checked-out source build
CRON_TZ=${config.schedule.timezone}
${config.schedule.cron} node /ABSOLUTE/PATH/TO/PLAYCISION/dist/cli.js --cwd /ABSOLUTE/PATH/TO/PROJECT digest --notify

# Windows Task Scheduler (PowerShell, daily example)
# schtasks /Create /SC DAILY /ST 09:00 /TN "Playcision Daily" /TR "node C:\\ABSOLUTE\\PATH\\TO\\PLAYCISION\\dist\\cli.js --cwd C:\\ABSOLUTE\\PATH\\TO\\PROJECT digest --notify"

# Generated instructions do not register a task automatically.
`;
}
