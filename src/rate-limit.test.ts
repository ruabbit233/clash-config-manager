import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, cleanupRateLimitStore } from './rate-limit';

describe('rate-limit', () => {
  beforeEach(() => {
    cleanupRateLimitStore();
  });

  it('should allow initial request', () => {
    const result = checkRateLimit('192.168.1.1', 5, 60);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('should count down remaining requests', () => {
    checkRateLimit('192.168.1.2', 3, 60);
    checkRateLimit('192.168.1.2', 3, 60);
    const result = checkRateLimit('192.168.1.2', 3, 60);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it('should block request when limit exceeded', () => {
    checkRateLimit('192.168.1.3', 2, 60);
    checkRateLimit('192.168.1.3', 2, 60);
    const result = checkRateLimit('192.168.1.3', 2, 60);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('should track IPs independently', () => {
    checkRateLimit('192.168.1.4', 1, 60);
    const result1 = checkRateLimit('192.168.1.4', 1, 60);
    expect(result1.allowed).toBe(false);

    const result2 = checkRateLimit('192.168.1.5', 1, 60);
    expect(result2.allowed).toBe(true);
  });

  it('should return resetAt timestamp', () => {
    const result = checkRateLimit('192.168.1.6', 5, 60);
    expect(result.resetAt).toBeGreaterThan(Date.now() - 1000);
  });
});
