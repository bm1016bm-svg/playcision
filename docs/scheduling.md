# Scheduling

Playcision does not register an OS task or create a remote workflow unless the user explicitly selects and reviews one. Every scheduler needs:

- an absolute project working directory;
- a Node.js/Playcision executable visible to the scheduled process;
- `SLACK_WEBHOOK_URL` supplied outside the repository when Slack is enabled;
- logs that do not contain secrets;
- a manual test before unattended delivery.

The YAML `schedule.cron` field uses a five-field expression. `schedule.timezone` is an IANA name. How those values map to a scheduler depends on the platform.

## Windows Task Scheduler

Copy [`run-playcision.ps1`](../examples/scheduler/run-playcision.ps1), edit both absolute paths, and run it manually from the same Windows account that will own the task.

Do not put the webhook in `/TR` or the script. Make it available to that account through a protected bootstrap or an inherited environment variable, then confirm `playcision doctor` reports only the redacted shape.

PowerShell example:

```powershell
$action = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\absolute\path\to\run-playcision.ps1"'
schtasks.exe /Create /SC DAILY /ST 09:00 /TN "Playcision Daily" /TR $action
```

Review an existing task before using `/F` because that option overwrites the named task. The official syntax and security-context options are in Microsoft's [`schtasks /create` documentation](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/schtasks-create).

## Linux cron

Copy [`playcision-digest.sh`](../examples/scheduler/playcision-digest.sh), edit the absolute paths, and make it owner-executable:

```sh
chmod 700 /absolute/path/to/playcision-digest.sh
```

If Slack is enabled, keep the exported environment value in a file outside the repository and readable only by that user:

```sh
chmod 600 "$HOME/.config/playcision/secrets.env"
```

Add the task with `crontab -e`:

```cron
CRON_TZ=Asia/Taipei
0 9 * * * /absolute/path/to/playcision-digest.sh
```

Cron implementations vary. `CRON_TZ` is documented by [Linux `crontab(5)`](https://man7.org/linux/man-pages/man5/crontab.5.html), but verify it on the target system. Cron has a minimal environment; the wrapper uses absolute paths for that reason.

## macOS launchd

Copy [the shell wrapper](../examples/scheduler/playcision-digest.sh) and [`dev.playcision.digest.plist`](../examples/scheduler/dev.playcision.digest.plist). Replace every absolute placeholder. Keep secrets outside the plist and repository.

Install for the logged-in user:

```sh
chmod 700 /absolute/path/to/playcision-digest.sh
cp /absolute/path/to/dev.playcision.digest.plist "$HOME/Library/LaunchAgents/dev.playcision.digest.plist"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/dev.playcision.digest.plist"
```

`StartCalendarInterval` uses the Mac's local calendar. If `schedule.timezone` differs from the system time zone, calculate a platform-specific schedule rather than assuming launchd reads the YAML IANA value. Apple documents agent/daemon script execution in the [Terminal User Guide](https://support.apple.com/en-mide/guide/terminal/apdc6c1077b-5d5d-4d35-9c19-60f2397b2369/mac).

## GitHub Actions

Copy [`daily-digest.yml`](../examples/github-actions/daily-digest.yml) into `.github/workflows/` only after a remote repository exists. The example builds the checked-out source; it does not use `npx playcision` because no npm publication is asserted.

Add `SLACK_WEBHOOK_URL` as a repository or environment Actions secret. GitHub documents secret use in [Using secrets in GitHub Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets). Do not expose the value through step output, debug tracing, artifacts, or pull-request code from an untrusted fork.

The example includes:

- `schedule` and `workflow_dispatch`;
- an explicit IANA `timezone`;
- `contents: read` permissions;
- `concurrency` with `cancel-in-progress: false`;
- one unique cache key per run plus a restore prefix;
- the webhook mapped only at the delivery step.

GitHub's [scheduled event documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) states that scheduled workflows run from the latest commit on the default branch, can be delayed or dropped during high load, have a five-minute minimum interval, and may be disabled after 60 days of inactivity in a public repository. The example uses 09:07 instead of the start of the hour to reduce exposure to the busiest period; this is mitigation, not a timing guarantee.

GitHub-hosted runners are [fresh virtual machines](https://docs.github.com/en/actions/reference/runners/github-hosted-runners). `state.json` therefore needs external persistence. The example uses [dependency caching](https://docs.github.com/en/actions/concepts/workflows-and-actions/dependency-caching), but GitHub explicitly treats caches as reusable files, not a durable database. A cache may miss, be scoped away, or be evicted.

Consequences:

- local-observed-low and deduplication history can reset;
- a Slack message can be duplicated after a cache miss or interrupted save;
- overlapping runs are serialized, but delivery remains best-effort;
- exactly-once delivery requires durable transactional infrastructure, which is outside V1.

The workflow uses the official [`actions/checkout`](https://github.com/actions/checkout), [`actions/setup-node`](https://github.com/actions/setup-node), and [`actions/cache`](https://github.com/actions/cache) projects. Review version changes before updating action majors.

## Operational check

After installation:

1. run `playcision doctor` in the scheduler's account and working directory;
2. generate a preview without delivery with `playcision digest --dry-run`;
3. trigger one manual run;
4. confirm file output, redacted logs, Slack rendering, and state update;
5. simulate missing state so the reset warning is visible.
