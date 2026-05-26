// Barrel for @primus/web-shared. Consumers should prefer narrow imports
// (e.g. `import { createApiClient } from '@primus/web-shared/api'`) so
// tree-shaking removes unused subsystems.

export { createApiClient } from './api/client';
export type { ApiClientOptions, OfflineQueueEntry } from './api/client';
export { useSharedAuthStore } from './auth/store';
export type { AuthState, AuthUser } from './auth/store';
export { SharedLogin } from './auth/login';
export { createWsManager } from './ws/manager';
export type { WsManager, WsManagerOptions } from './ws/manager';
