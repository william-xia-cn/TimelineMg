export interface Env {
  DB: D1Database;
  SNAPSHOTS: R2Bucket;
  APP_CACHE: KVNamespace;
  TIMEWHERE_ENV: string;
  GOOGLE_OIDC_CLIENT_ID: string;
}

export interface ApiError {
  code: string;
  message: string;
  retryable?: boolean;
}

export interface SessionContext {
  accountId: string;
  sessionId: string;
}

export interface GoogleIdentity {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
}

export interface LocalSnapshot {
  schema?: string;
  exported_at?: string;
  device_id?: string;
  data?: Record<string, unknown>;
}
