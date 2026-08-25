import assert from "node:assert/strict";
import test from "node:test";
import {
  WIKI_CACHE_KEY,
  WIKI_REFRESH_INTERVAL_MS,
  readWikiCache,
  shouldRefreshWiki,
  writeWikiCache,
} from "../mod/src/wiki-cache.js";

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
  };
}

test("游戏内攻略缓存可在增量刷新时保留旧页面", () => {
  const storage = memoryStorage({
    [WIKI_CACHE_KEY]: JSON.stringify({ pages: { 农场袭击: { title: "农场袭击" } }, indexTitles: ["农场袭击"], syncedAt: "2026-08-24T00:00:00.000Z" }),
  });
  const next = writeWikiCache({ pages: { 艾弗里: { title: "艾弗里" } }, syncedAt: "2026-08-25T00:00:00.000Z" }, storage);
  assert.deepEqual(Object.keys(next.pages).sort(), ["农场袭击", "艾弗里"].sort());
  assert.deepEqual(readWikiCache(storage), next);
});

test("攻略每六小时自动尝试刷新一次", () => {
  const now = Date.parse("2026-08-25T12:00:00.000Z");
  assert.equal(shouldRefreshWiki(new Date(now - WIKI_REFRESH_INTERVAL_MS + 1).toISOString(), now), false);
  assert.equal(shouldRefreshWiki(new Date(now - WIKI_REFRESH_INTERVAL_MS).toISOString(), now), true);
  assert.equal(shouldRefreshWiki(null, now), true);
});
