const DB_NAME = "habin-admin";
const STORE = "assets";

// Image files cannot survive a reload in memory, but Blobs are structured-
// cloneable, so the whole asset record (file included) persists in IndexedDB.
// Object URLs are per-session and stripped before writing.

export async function persistAsset(asset) {
  const { url, ...record } = asset;
  const db = await openDb();
  try {
    await requestDone(db.transaction(STORE, "readwrite").objectStore(STORE).put(record));
  } finally {
    db.close();
  }
}

export async function loadPersistedAssets() {
  const db = await openDb();
  try {
    const records = await requestDone(db.transaction(STORE, "readonly").objectStore(STORE).getAll());
    return Array.isArray(records) ? records : [];
  } finally {
    db.close();
  }
}

export async function removePersistedAsset(id) {
  const db = await openDb();
  try {
    await requestDone(db.transaction(STORE, "readwrite").objectStore(STORE).delete(id));
  } finally {
    db.close();
  }
}

export async function clearPersistedAssets() {
  const db = await openDb();
  try {
    await requestDone(db.transaction(STORE, "readwrite").objectStore(STORE).clear());
  } finally {
    db.close();
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestDone(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
