export type SteamProviderErrorCode =
  | 'STEAM_HTTP_ERROR'
  | 'STEAM_NETWORK_ERROR'
  | 'STEAM_TIMEOUT'
  | 'STEAM_SCHEMA_DRIFT'
  | 'STEAM_INVALID_APP_ID'
  | 'STEAM_INVALID_STEAM_ID'
  | 'STEAM_CURRENCY_MISMATCH'
  | 'STEAM_QUERY_TOO_BROAD';

interface SteamProviderErrorOptions {
  status?: number;
  endpoint?: string;
  retryAfterMs?: number;
  cause?: unknown;
}

/** A redacted, actionable error from Steam's experimental Store adapters. */
export class SteamProviderError extends Error {
  readonly code: SteamProviderErrorCode;
  readonly status: number | undefined;
  readonly endpoint: string | undefined;
  readonly retryAfterMs: number | undefined;

  constructor(code: SteamProviderErrorCode, message: string, options: SteamProviderErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'SteamProviderError';
    this.code = code;
    this.status = options.status;
    this.endpoint = options.endpoint;
    this.retryAfterMs = options.retryAfterMs;
  }
}

export function schemaDrift(endpoint: string, detail: string, cause?: unknown): SteamProviderError {
  return new SteamProviderError(
    'STEAM_SCHEMA_DRIFT',
    `Steam's experimental ${endpoint} response no longer matches the expected schema: ${detail}`,
    cause === undefined ? { endpoint } : { endpoint, cause },
  );
}
