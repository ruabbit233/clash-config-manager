import { AuthError } from './auth';

export interface LoginResponse { token: string; expiresAt: string; }
export interface ConfigResponse { content: string; versionId: string; updatedAt: string; }
export interface SaveConfigResponse { versionId: string; contentHash: string; createdAt: string; }
export interface VersionListItem { id: string; createdAt: string; message: string; contentHash: string; }
export interface VersionSnapshot { id: string; content: string; message: string; createdAt: string; contentHash: string; }
export interface HeadersConfig { [headerName: string]: string; }
export interface DiffResponse { fromVersion: string; toVersion: string; diff: string; }

export class ApiClient {
  private baseUrl: string;
  private getToken: () => string | null;

  constructor(baseUrl: string, getToken: () => string | null) {
    this.baseUrl = baseUrl;
    this.getToken = getToken;
  }

  private async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json');
    }
    const token = this.getToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const res = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
    
    if (!res.ok) {
      if (res.status === 401) {
        throw new AuthError();
      }
      const errText = await res.text();
      let errMsg = res.statusText;
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.error || errJson.message || errMsg;
      } catch {
        if (errText) errMsg = errText;
      }
      throw new Error(errMsg);
    }

    if (res.status === 204) return {} as T;
    return await res.json();
  }

  async login(password: string): Promise<LoginResponse> {
    return this.fetch<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password })
    });
  }

  async verifyToken(token: string): Promise<{ valid: boolean; expiresAt: string }> {
    return this.fetch<{ valid: boolean; expiresAt: string }>('/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ token })
    });
  }

  async getConfig(): Promise<ConfigResponse> {
    return this.fetch<ConfigResponse>('/api/config');
  }

  async saveConfig(content: string, message?: string): Promise<SaveConfigResponse> {
    return this.fetch<SaveConfigResponse>('/api/config', {
      method: 'PUT',
      body: JSON.stringify({ content, message })
    });
  }

  async listVersions(limit?: number, cursor?: string): Promise<{ keys: VersionListItem[]; cursor?: string }> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', limit.toString());
    if (cursor) params.set('cursor', cursor);
    return this.fetch<{ keys: VersionListItem[]; cursor?: string }>(`/api/versions?${params.toString()}`);
  }

  async getVersion(id: string): Promise<VersionSnapshot> {
    return this.fetch<VersionSnapshot>(`/api/versions/${id}`);
  }

  async rollbackVersion(id: string): Promise<SaveConfigResponse> {
    return this.fetch<SaveConfigResponse>(`/api/versions/${id}/rollback`, {
      method: 'POST'
    });
  }

  async getHeaders(): Promise<HeadersConfig> {
    return this.fetch<HeadersConfig>('/api/headers');
  }

  async setHeaders(headers: HeadersConfig): Promise<void> {
    return this.fetch<void>('/api/headers', {
      method: 'PUT',
      body: JSON.stringify(headers)
    });
  }

  async getDiff(fromId: string, toId: string): Promise<DiffResponse> {
    const [fromSnap, toSnap] = await Promise.all([
      this.getVersion(fromId),
      this.getVersion(toId),
    ]);
    return {
      fromVersion: fromId,
      toVersion: toId,
      diff: `${fromSnap.content}\n---\n${toSnap.content}`,
    };
  }
}
