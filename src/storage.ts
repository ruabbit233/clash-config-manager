import type {
  CurrentPointer,
  HeadersConfig,
  VersionListItem,
  VersionSnapshot,
} from "./types";
import { STORAGE_CONFIG } from "./types";

const { VERSION_PREFIX, CURRENT_KEY, HEADERS_KEY } = STORAGE_CONFIG;

const ULID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const encodeBase32 = (value: number, length: number): string => {
  let remaining = value;
  let encoded = "";

  for (let i = 0; i < length; i += 1) {
    encoded = ULID_ALPHABET[remaining % 32] + encoded;
    remaining = Math.floor(remaining / 32);
  }

  return encoded;
};

const generateUlid = (): string => {
  const timestampPart = encodeBase32(Date.now(), 10);
  const random = new Uint8Array(10);
  crypto.getRandomValues(random);
  let randomValue = 0n;

  for (const byte of random) {
    randomValue = (randomValue << 8n) | BigInt(byte);
  }

  let randomPart = "";
  for (let i = 0; i < 16; i += 1) {
    const index = Number(randomValue & 31n);
    randomPart = ULID_ALPHABET[index] + randomPart;
    randomValue >>= 5n;
  }

  return `${timestampPart}${randomPart}`;
};

const hashContent = async (content: string): Promise<string> => {
  const buffer = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = new Uint8Array(digest);

  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const saveVersion = async (
  kv: KVNamespace,
  content: string,
  message: string,
): Promise<VersionSnapshot> => {
  const id = generateUlid();
  const createdAt = new Date().toISOString();
  const contentHash = await hashContent(content);

  const snapshot: VersionSnapshot = {
    id,
    content,
    message,
    createdAt,
    contentHash,
  };

  const pointer: CurrentPointer = {
    versionId: id,
    updatedAt: createdAt,
  };

  await kv.put(`${VERSION_PREFIX}${id}`, JSON.stringify(snapshot));
  await kv.put(CURRENT_KEY, JSON.stringify(pointer));

  return snapshot;
};

export const getVersion = async (
  kv: KVNamespace,
  versionId: string,
): Promise<VersionSnapshot | null> => {
  const snapshot = await kv.get<VersionSnapshot>(`${VERSION_PREFIX}${versionId}`, "json");
  return snapshot ?? null;
};

export const listVersions = async (
  kv: KVNamespace,
  limit: number = STORAGE_CONFIG.DEFAULT_PAGE_LIMIT,
  cursor?: string,
): Promise<{ keys: VersionListItem[]; cursor?: string }> => {
  const result = await kv.list({
    prefix: VERSION_PREFIX,
    limit,
    cursor,
  });

  const snapshots = await Promise.all(
    result.keys.map(async (key) => {
      const id = key.name.slice(VERSION_PREFIX.length);
      return getVersion(kv, id);
    }),
  );

  const keys: VersionListItem[] = snapshots
    .filter((item): item is VersionSnapshot => item !== null)
    .map((item) => ({
      id: item.id,
      createdAt: item.createdAt,
      message: item.message,
      contentHash: item.contentHash,
    }))
    .sort((a, b) => b.id.localeCompare(a.id));

  return {
    keys,
    cursor: result.list_complete ? undefined : result.cursor,
  };
};

export const getCurrent = async (
  kv: KVNamespace,
): Promise<(CurrentPointer & { content: string }) | null> => {
  const pointer = await kv.get<CurrentPointer>(CURRENT_KEY, "json");
  if (!pointer) {
    return null;
  }

  const version = await getVersion(kv, pointer.versionId);
  if (!version) {
    return null;
  }

  return {
    ...pointer,
    content: version.content,
  };
};

export const getHeaders = async (kv: KVNamespace): Promise<HeadersConfig> => {
  const headers = await kv.get<HeadersConfig>(HEADERS_KEY, "json");
  return headers ?? {};
};

export const setHeaders = async (
  kv: KVNamespace,
  headers: HeadersConfig,
): Promise<void> => {
  await kv.put(HEADERS_KEY, JSON.stringify(headers));
};
