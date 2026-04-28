import type { TokenPayload } from "./types";

const DEFAULT_EXPIRES_IN_SECONDS = 604800;

const toBase64 = (input: string): string => btoa(input);

const toBase64Url = (input: string): string =>
  toBase64(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

const fromBase64Url = (input: string): string => {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(paddingLength);
  return atob(padded);
};

const uint8ToBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return toBase64Url(binary);
};

const importHmacKey = async (secret: string): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

export const generateToken = async (
  secret: string,
  expiresInSeconds = DEFAULT_EXPIRES_IN_SECONDS,
): Promise<string> => {
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    iat: now,
    exp: now + expiresInSeconds,
  };

  const header = {
    alg: "HS256",
    typ: "JWT",
  };

  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const body = `${encodedHeader}.${encodedPayload}`;

  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );

  return `${body}.${uint8ToBase64Url(new Uint8Array(signature))}`;
};

export const verifyToken = async (
  secret: string,
  token: string,
): Promise<TokenPayload | null> => {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  try {
    const decodedHeader = JSON.parse(fromBase64Url(encodedHeader)) as {
      alg?: string;
      typ?: string;
    };

    if (decodedHeader.alg !== "HS256" || decodedHeader.typ !== "JWT") {
      return null;
    }

    const decodedPayload = JSON.parse(fromBase64Url(encodedPayload)) as TokenPayload;

    if (
      typeof decodedPayload.exp !== "number" ||
      typeof decodedPayload.iat !== "number"
    ) {
      return null;
    }

    const key = await importHmacKey(secret);
    const body = `${encodedHeader}.${encodedPayload}`;

    const signatureBytes = Uint8Array.from(fromBase64Url(encodedSignature), (char) =>
      char.charCodeAt(0),
    );

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      new TextEncoder().encode(body),
    );

    if (!valid) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (decodedPayload.exp <= now) {
      return null;
    }

    return decodedPayload;
  } catch {
    return null;
  }
};
