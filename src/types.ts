export interface Env {
  KV: KVNamespace;
  ASSETS: Fetcher;
  ADMIN_PASSWORD: string;
  TOKEN_SECRET: string;
}

export interface VersionSnapshot {
  id: string;
  content: string;
  message: string;
  createdAt: string;
  contentHash: string;
}

export interface CurrentPointer {
  versionId: string;
  updatedAt: string;
}

export interface HeadersConfig {
  [headerName: string]: string;
}

export interface TokenPayload {
  exp: number;
  iat: number;
}

export interface VersionListItem {
  id: string;
  createdAt: string;
  message: string;
  contentHash: string;
}

export const AUTH_CONFIG = {
  /** JWT token expiry in seconds (default: 7 days) */
  TOKEN_EXPIRY_SECONDS: 604_800,
  /** Max login attempts per IP within the rate limit window */
  RATE_LIMIT_MAX_ATTEMPTS: 10,
  /** Rate limit window in seconds */
  RATE_LIMIT_WINDOW_SECONDS: 60,
  /** Cookie name for httpOnly auth token */
  COOKIE_NAME: "clash_admin_token",
  /** Cookie name for token expiry */
  COOKIE_EXPIRES_NAME: "clash_admin_expires",
} as const;

export const STORAGE_CONFIG = {
  /** Default pagination limit for version listing */
  DEFAULT_PAGE_LIMIT: 20,
  /** KV key prefix for version snapshots */
  VERSION_PREFIX: "version:",
  /** KV key for current config pointer */
  CURRENT_KEY: "config:current",
  /** KV key for custom response headers */
  HEADERS_KEY: "headers:config",
} as const;

export const HEADER_CONFIG = {
  /** Max length for a single header value */
  MAX_HEADER_VALUE_LENGTH: 4096,
  /** Pattern for valid header names */
  NAME_PATTERN: /^[a-zA-Z0-9-]+$/,
  /** Download filename for YAML config */
  DOWNLOAD_FILENAME: "clash-config.yaml",
} as const;
