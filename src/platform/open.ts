import open from 'open';

function validateAppId(appId: string): string {
  if (!/^\d+$/.test(appId)) throw new Error(`Invalid Steam App ID: ${appId}`);
  return appId;
}

export async function openSteamStore(appId: string): Promise<void> {
  await open(`https://store.steampowered.com/app/${validateAppId(appId)}/`, { wait: false });
}

export async function launchSteamGame(appId: string): Promise<void> {
  if (!process.stdout.isTTY || process.env.CI) {
    throw new Error('Refusing to launch a game in a non-interactive or CI environment.');
  }
  await open(`steam://rungameid/${validateAppId(appId)}`, { wait: false });
}
