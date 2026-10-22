export { configSchema, defaultConfig, type PlaycisionConfig } from './config/schema.js';
export { getProjectPaths, loadConfig, serializeConfig } from './config/load.js';
export type {
  Digest,
  Game,
  GamePrice,
  GameProvider,
  Money,
  ProviderDiagnostic,
  ProviderQuery,
  Recommendation,
} from './domain/types.js';
export { SteamProvider, SteamProviderError, createSteamProvider as createRawSteamProvider } from './provider/index.js';
export * as core from './core/index.js';
export * as state from './state/index.js';
export {
  buildAndDeliverDigest,
  createSteamProvider as createConfiguredSteamProvider,
  dealGames,
  discoverGames,
  rollGame as recommendGame,
} from './application/service.js';
