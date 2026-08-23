const MANIFEST_MARKER = "clientflow-secure-session";
const MANIFEST_VERSION = 1;
const DEFAULT_CHUNK_SIZE = 1_800;
const MAX_CHUNK_COUNT = 512;

interface SecureStoreBackend {
  deleteItemAsync(key: string): Promise<void>;
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: unknown): Promise<void>;
}

interface LegacyStorageBackend {
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
}

interface SecureSessionStorageOptions {
  chunkSize?: number;
  createGeneration?: () => string;
  secureStoreOptions?: unknown;
}

interface SessionManifest {
  chunks: number;
  generation: string;
  marker: typeof MANIFEST_MARKER;
  version: typeof MANIFEST_VERSION;
}

let generationCounter = 0;

export function createSecureSessionStorage(
  secureStore: SecureStoreBackend,
  legacyStorage: LegacyStorageBackend,
  options: SecureSessionStorageOptions = {},
) {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 256) {
    throw new Error("Secure session chunk size must be at least 256 characters.");
  }

  const createGeneration = options.createGeneration ?? defaultGeneration;

  const storage = {
    async getItem(key: string) {
      const storedManifest = await secureStore.getItemAsync(key);
      if (storedManifest !== null) {
        return readSecureValue(secureStore, key, storedManifest);
      }

      const legacyValue = await legacyStorage.getItem(key);
      if (legacyValue === null) return null;

      await writeSecureValue(key, legacyValue);
      await legacyStorage.removeItem(key);
      return legacyValue;
    },

    async removeItem(key: string) {
      const storedManifest = await secureStore.getItemAsync(key);
      const manifest = parseManifest(storedManifest);
      const failures: unknown[] = [];

      if (manifest) {
        for (let index = 0; index < manifest.chunks; index += 1) {
          try {
            await secureStore.deleteItemAsync(chunkKey(key, manifest, index));
          } catch (error) {
            failures.push(error);
          }
        }
      }

      try {
        await secureStore.deleteItemAsync(key);
      } catch (error) {
        failures.push(error);
      }
      try {
        await legacyStorage.removeItem(key);
      } catch (error) {
        failures.push(error);
      }

      if (failures.length > 0) throw failures[0];
    },

    async setItem(key: string, value: string) {
      await writeSecureValue(key, value);
      await legacyStorage.removeItem(key);
    },
  };

  return storage;

  async function writeSecureValue(key: string, value: string) {
    const previousManifest = parseManifest(await secureStore.getItemAsync(key));
    const encoded = encodeURIComponent(value);
    const chunks = splitIntoChunks(encoded, chunkSize);
    if (chunks.length > MAX_CHUNK_COUNT) {
      throw new Error("Supabase Session exceeds the secure storage limit.");
    }

    const manifest: SessionManifest = {
      chunks: chunks.length,
      generation: sanitizeGeneration(createGeneration()),
      marker: MANIFEST_MARKER,
      version: MANIFEST_VERSION,
    };
    const writtenChunkKeys: string[] = [];

    try {
      for (let index = 0; index < chunks.length; index += 1) {
        const keyForChunk = chunkKey(key, manifest, index);
        await secureStore.setItemAsync(
          keyForChunk,
          chunks[index],
          options.secureStoreOptions,
        );
        writtenChunkKeys.push(keyForChunk);
      }
      await secureStore.setItemAsync(
        key,
        JSON.stringify(manifest),
        options.secureStoreOptions,
      );
    } catch (error) {
      await Promise.allSettled(
        writtenChunkKeys.map((keyForChunk) =>
          secureStore.deleteItemAsync(keyForChunk),
        ),
      );
      throw error;
    }

    if (previousManifest) {
      await Promise.allSettled(
        Array.from({ length: previousManifest.chunks }, (_, index) =>
          secureStore.deleteItemAsync(
            chunkKey(key, previousManifest, index),
          ),
        ),
      );
    }
  }
}

async function readSecureValue(
  secureStore: SecureStoreBackend,
  key: string,
  storedManifest: string,
) {
  const manifest = parseManifest(storedManifest);
  if (!manifest) return null;

  const chunks: string[] = [];
  for (let index = 0; index < manifest.chunks; index += 1) {
    const chunk = await secureStore.getItemAsync(chunkKey(key, manifest, index));
    if (chunk === null) return null;
    chunks.push(chunk);
  }

  try {
    return decodeURIComponent(chunks.join(""));
  } catch {
    return null;
  }
}

function parseManifest(value: string | null): SessionManifest | null {
  if (value === null) return null;
  try {
    const candidate = JSON.parse(value) as Partial<SessionManifest>;
    if (
      candidate.marker !== MANIFEST_MARKER ||
      candidate.version !== MANIFEST_VERSION ||
      !Number.isSafeInteger(candidate.chunks) ||
      candidate.chunks === undefined ||
      candidate.chunks < 1 ||
      candidate.chunks > MAX_CHUNK_COUNT ||
      typeof candidate.generation !== "string" ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(candidate.generation)
    ) {
      return null;
    }
    return candidate as SessionManifest;
  } catch {
    return null;
  }
}

function splitIntoChunks(value: string, chunkSize: number) {
  if (value.length === 0) return [""];
  const chunks: string[] = [];
  for (let offset = 0; offset < value.length; offset += chunkSize) {
    chunks.push(value.slice(offset, offset + chunkSize));
  }
  return chunks;
}

function chunkKey(key: string, manifest: SessionManifest, index: number) {
  return `${key}.cf.${manifest.generation}.${index}`;
}

function defaultGeneration() {
  generationCounter += 1;
  return `${Date.now().toString(36)}_${generationCounter.toString(36)}`;
}

function sanitizeGeneration(value: string) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(value)) {
    throw new Error("Secure session generation is invalid.");
  }
  return value;
}
