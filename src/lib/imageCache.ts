import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';

interface WeatherCacheDB extends DBSchema {
  images: {
    key: string;
    value: {
      url: string;
      blob: Blob;
      timestamp: number;
      sector: string;
    };
  };
  metadata: {
    key: string;
    value: {
      lastFetch: number;
      frameCount: number;
    };
  };
}

const DB_NAME = 'weather-loop-cache';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<WeatherCacheDB>> | null = null;

function getDB(): Promise<IDBPDatabase<WeatherCacheDB>> {
  if (!dbPromise) {
    dbPromise = openDB<WeatherCacheDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('images')) {
          db.createObjectStore('images', { keyPath: 'url' });
        }
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

export async function getCachedImage(url: string): Promise<Blob | null> {
  const db = await getDB();
  const record = await db.get('images', url);
  return record?.blob ?? null;
}

export async function cacheImage(url: string, blob: Blob, sector: string): Promise<void> {
  const db = await getDB();
  await db.put('images', {
    url,
    blob,
    timestamp: Date.now(),
    sector,
  });
}

export async function getCachedImageUrl(url: string): Promise<string | null> {
  const blob = await getCachedImage(url);
  if (blob) {
    return URL.createObjectURL(blob);
  }
  return null;
}

export async function fetchAndCacheImage(url: string, sector: string): Promise<string> {
  // Check cache first
  const cached = await getCachedImage(url);
  if (cached) {
    return URL.createObjectURL(cached);
  }

  // Fetch from network
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  const blob = await response.blob();
  await cacheImage(url, blob, sector);
  return URL.createObjectURL(blob);
}

export async function clearOldCache(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('images', 'readwrite');
  const store = tx.objectStore('images');
  const now = Date.now();

  let cursor = await store.openCursor();
  while (cursor) {
    if (now - cursor.value.timestamp > maxAgeMs) {
      await cursor.delete();
    }
    cursor = await cursor.continue();
  }

  await tx.done;
}

export async function getCacheStats(): Promise<{ count: number; sizeMB: number }> {
  const db = await getDB();
  const all = await db.getAll('images');
  const totalSize = all.reduce((sum, item) => sum + item.blob.size, 0);
  return {
    count: all.length,
    sizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100,
  };
}
