import seedCache from "./wiki-seed.json" with { type: "json" };

export const WIKI_CACHE_KEY = "dol-quest-assistant:wiki-cache:v1";
export const WIKI_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

function normalize(value) {
  return {
    pages: value?.pages && typeof value.pages === "object" ? value.pages : {},
    indexTitles: Array.isArray(value?.indexTitles) ? value.indexTitles : [],
    syncedAt: value?.syncedAt || value?.updatedAt || null,
  };
}

export function readWikiCache(storage = globalThis.localStorage) {
  try {
    const saved = storage?.getItem(WIKI_CACHE_KEY);
    if (saved) return normalize(JSON.parse(saved));
  } catch {
    // localStorage 可能被隐私设置禁用，内置缓存仍可继续使用。
  }
  return normalize(seedCache);
}

export function writeWikiCache(update, storage = globalThis.localStorage) {
  const current = readWikiCache(storage);
  const next = normalize({
    pages: { ...current.pages, ...(update?.pages || {}) },
    indexTitles: update?.indexTitles || current.indexTitles,
    syncedAt: update?.syncedAt || current.syncedAt,
  });
  try {
    storage?.setItem(WIKI_CACHE_KEY, JSON.stringify(next));
  } catch {
    // 缓存写入失败不应阻断任务判定。
  }
  return next;
}

export function shouldRefreshWiki(syncedAt, now = Date.now()) {
  const timestamp = Date.parse(syncedAt || "");
  return !Number.isFinite(timestamp) || now - timestamp >= WIKI_REFRESH_INTERVAL_MS;
}
