export interface VersionSnapshot {
  id: string;
  content: string;
  message: string;
  createdAt: string;
  contentHash: string;
}

export interface VersionListItem {
  id: string;
  createdAt: string;
  message: string;
  contentHash: string;
}

export interface HeadersConfig {
  [headerName: string]: string;
}

export interface TokenPayload {
  exp: number;
  iat: number;
}
