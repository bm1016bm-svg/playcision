#!/bin/sh
set -eu

# Edit both paths. Cron and launchd have a minimal PATH, so use absolute paths.
PLAYCISION_PROJECT="/absolute/path/to/project"
PLAYCISION_BIN="/absolute/path/to/playcision"

# Optional secret file must live outside the repository and be mode 0600.
PLAYCISION_SECRETS_FILE="${PLAYCISION_SECRETS_FILE:-$HOME/.config/playcision/secrets.env}"
if [ -r "$PLAYCISION_SECRETS_FILE" ]; then
  # The file may contain: export SLACK_WEBHOOK_URL='https://hooks.slack.com/services/...'
  . "$PLAYCISION_SECRETS_FILE"
fi

cd "$PLAYCISION_PROJECT"
exec "$PLAYCISION_BIN" digest --notify
