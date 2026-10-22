import * as p from '@clack/prompts';
import { configSchema, defaultConfig, type PlaycisionConfig } from '../config/schema.js';
import { initializeProject } from './project.js';

function exitOnCancel<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel('Initialization cancelled. Nothing was written.');
    process.exitCode = 2;
    throw new Error('Initialization cancelled.');
  }
  return value;
}

function csv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function validateNumericCsv(value: string): string | undefined {
  const invalid = csv(value).find((item) => !/^\d+$/u.test(item));
  return invalid ? `Steam App IDs must be numeric; received ${invalid}.` : undefined;
}

function validateInteger(value: string, minimum: number, maximum: number): string | undefined {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum
    ? undefined
    : `Enter an integer from ${minimum} to ${maximum}.`;
}

export async function runInitWizard(cwd: string, options: { force?: boolean; yes?: boolean }): Promise<string[]> {
  if (options.yes) return initializeProject(cwd, defaultConfig, { force: options.force });
  if (!process.stdin.isTTY) {
    throw new Error('Interactive init needs a TTY. Use `playcision init --yes` for defaults.');
  }

  p.intro('PLAYCISION // INITIALIZE');
  const country = exitOnCancel(await p.text({ message: 'Country code', initialValue: 'TW', validate: (value) => value.length === 2 ? undefined : 'Use a 2-letter code.' }));
  const currency = exitOnCancel(await p.text({ message: 'Currency', initialValue: 'TWD', validate: (value) => value.length === 3 ? undefined : 'Use a 3-letter currency.' }));
  const language = exitOnCancel(await p.select({
    message: 'Steam language',
    initialValue: 'tchinese',
    options: [
      { value: 'tchinese', label: '繁體中文' },
      { value: 'english', label: 'English' },
      { value: 'japanese', label: '日本語' },
      { value: 'schinese', label: '简体中文' },
    ],
  }));
  const tags = csv(exitOnCancel(await p.text({ message: 'Tags (comma-separated)', placeholder: 'Roguelike, Sexual Content' })));
  const genres = csv(exitOnCancel(await p.text({ message: 'Genres (comma-separated, optional)', placeholder: 'Action, Indie' })));
  const developers = csv(exitOnCancel(await p.text({ message: 'Developers (comma-separated, optional)', placeholder: 'Developer name' })));
  const includeAppIds = csv(exitOnCancel(await p.text({
    message: 'Always-track Steam App IDs (comma-separated, optional)',
    placeholder: '1091500, 413150',
    validate: validateNumericCsv,
  })));
  const wishlistAppIds = csv(exitOnCancel(await p.text({
    message: 'Wishlist Steam App IDs (comma-separated, optional)',
    placeholder: '1091500, 413150',
    validate: validateNumericCsv,
  })));
  const wishlistSteamIdValue = exitOnCancel(await p.text({
    message: 'Public SteamID64 for wishlist sync (optional)',
    placeholder: '7656119...',
    validate: (value) => !value.trim() || /^\d{1,20}$/.test(value.trim()) ? undefined : 'Use a numeric SteamID64.',
  }));
  const discoverDaysText = exitOnCancel(await p.text({
    message: 'How many release days should Discover include?',
    initialValue: '7',
    validate: (value) => validateInteger(value, 1, 365),
  }));
  const includeEarlyAccess = exitOnCancel(await p.confirm({ message: 'Include Early Access?', initialValue: true }));
  const includeMature = exitOnCancel(await p.confirm({ message: 'Include mature/adult-tagged content?', initialValue: true }));
  const maxPriceText = exitOnCancel(await p.text({
    message: `Deal price ceiling (${currency}; blank means no ceiling)`,
    initialValue: '300',
    validate: (value) => !value.trim() || (Number.isFinite(Number(value)) && Number(value) >= 0) ? undefined : 'Enter zero or a positive number.',
  }));
  const minDiscountText = exitOnCancel(await p.text({
    message: 'Minimum discount percent',
    initialValue: '20',
    validate: (value) => validateInteger(value, 0, 100),
  }));
  const localObservedLowOnly = exitOnCancel(await p.confirm({
    message: 'Only report prices at this state file\'s observed low?',
    initialValue: false,
  }));
  const markdownEnabled = exitOnCancel(await p.confirm({ message: 'Write a Markdown digest?', initialValue: true }));
  const jsonEnabled = exitOnCancel(await p.confirm({ message: 'Write a JSON digest?', initialValue: false }));
  const slackEnabled = exitOnCancel(await p.confirm({ message: 'Send digests to Slack?', initialValue: false }));
  const slackWebhookEnv = slackEnabled
    ? exitOnCancel(await p.text({
        message: 'Slack webhook environment variable name',
        initialValue: 'SLACK_WEBHOOK_URL',
        validate: (value) => /^[A-Z_][A-Z0-9_]*$/u.test(value) ? undefined : 'Use an uppercase environment-variable name.',
      }))
    : 'SLACK_WEBHOOK_URL';
  const scheduleType = exitOnCancel(await p.select({
    message: 'Scheduler',
    initialValue: 'none',
    options: [
      { value: 'none', label: 'Not now' },
      { value: 'local', label: 'Local scheduler instructions' },
      { value: 'github', label: 'GitHub Actions workflow' },
    ],
  }));
  const scheduleCron = scheduleType === 'none'
    ? '0 9 * * *'
    : exitOnCancel(await p.text({
        message: 'Five-field daily schedule',
        initialValue: '0 9 * * *',
        validate: (value) => value.trim().split(/\s+/u).length === 5 ? undefined : 'Use a five-field cron expression.',
      }));
  const scheduleTimezone = scheduleType === 'none'
    ? 'Asia/Taipei'
    : exitOnCancel(await p.text({ message: 'IANA time zone', initialValue: 'Asia/Taipei' }));

  const config: PlaycisionConfig = configSchema.parse({
    locale: { country: country.toUpperCase(), currency: currency.toUpperCase(), language },
    interests: { tags, genres, developers, includeAppIds },
    discover: {
      days: Number(discoverDaysText),
      includeEarlyAccess,
      includeMature,
    },
    deals: {
      maxPrice: maxPriceText.trim() ? Number(maxPriceText) : null,
      minDiscountPercent: Number(minDiscountText),
      localObservedLowOnly,
      wishlistAppIds,
      wishlistSteamId: wishlistSteamIdValue.trim() || null,
    },
    outputs: {
      markdown: { enabled: markdownEnabled },
      json: { enabled: jsonEnabled },
      slack: { enabled: slackEnabled, webhookEnv: slackWebhookEnv },
    },
    schedule: { type: scheduleType, cron: scheduleCron, timezone: scheduleTimezone },
  });
  const created = await initializeProject(cwd, config, { force: options.force });
  p.outro(`Ready. Created ${created.length} files. Run: playcision doctor`);
  return created;
}
