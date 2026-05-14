export class AuthError extends Error {
  constructor(message: string = 'Authentication failed') {
    super(message);
    this.name = 'AuthError';
  }
}

const EXPIRES_COOKIE = 'clash_admin_expires';

let memoryToken: string | null = null;

export function getToken(): string | null {
  return memoryToken;
}

export function setToken(token: string): void {
  memoryToken = token;
}

export function clearToken(): void {
  memoryToken = null;
  document.cookie = `${EXPIRES_COOKIE}=; Path=/; Max-Age=0; SameSite=Strict`;
}

export function isAuthenticated(): boolean {
  return !!getExpiresAt();
}

export function getExpiresAt(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${EXPIRES_COOKIE}=([^;]+)`));
  if (!match) return null;
  return decodeURIComponent(match[1]);
}

export function setExpiresAt(expiresAt: string): void {
  document.cookie = `${EXPIRES_COOKIE}=${encodeURIComponent(expiresAt)}; Path=/; Secure; SameSite=Strict; Max-Age=${7 * 24 * 60 * 60}`;
}

export function handleAuthError(): void {
  clearToken();
  window.location.hash = '#/login';
}
