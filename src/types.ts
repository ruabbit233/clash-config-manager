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

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface VersionListItem {
  id: string;
  createdAt: string;
  message: string;
  contentHash: string;
}

export interface ConfigResponse {
  content: string;
  versionId: string;
  updatedAt: string;
}

export interface SaveConfigRequest {
  content: string;
  message?: string;
}

export interface SaveConfigResponse {
  versionId: string;
  contentHash: string;
  createdAt: string;
}

export interface LoginRequest {
  password: string;
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
}

export interface DiffResponse {
  fromVersion: string;
  toVersion: string;
  diff: string;
}
