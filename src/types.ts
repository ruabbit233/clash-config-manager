import type { HeadersConfig, TokenPayload, VersionListItem, VersionSnapshot } from '@shared/types'

export type { HeadersConfig, TokenPayload, VersionListItem, VersionSnapshot }

export interface Env {
  KV: KVNamespace
  ASSETS: Fetcher
  ADMIN_PASSWORD: string
  TOKEN_SECRET: string
}

export interface CurrentPointer {
  versionId: string
  updatedAt: string
}

export const AUTH_CONFIG = {
  /** JWT token expiry in seconds (default: 7 days) */
  TOKEN_EXPIRY_SECONDS: 604_800,
  /** Cookie name for httpOnly auth token */
  COOKIE_NAME: 'clash_admin_token',
  /** Cookie name for token expiry */
  COOKIE_EXPIRES_NAME: 'clash_admin_expires',
} as const

export const STORAGE_CONFIG = {
  /** Default pagination limit for version listing */
  DEFAULT_PAGE_LIMIT: 20,
  /** Maximum pagination limit for version listing */
  MAX_PAGE_LIMIT: 100,
  /** KV key prefix for version snapshots */
  VERSION_PREFIX: 'version:',
  /** KV key for current config pointer */
  CURRENT_KEY: 'config:current',
  /** KV key for custom response headers */
  HEADERS_KEY: 'headers:config',
} as const

export const HEADER_CONFIG = {
  /** Max length for a single header value */
  MAX_HEADER_VALUE_LENGTH: 4096,
  /** Pattern for valid header names */
  NAME_PATTERN: /^[a-zA-Z0-9-]+$/,
  /** Download filename for YAML config */
  DOWNLOAD_FILENAME: 'clash-config.yaml',
} as const
