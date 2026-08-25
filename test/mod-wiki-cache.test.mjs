import assert from "node:assert/strict";
import test from "node:test";
import {
  WIKI_CACHE_KEY,
  readWikiCache,
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

test("全新安装没有本地 Wiki 缓存时仍可启动", () => {
  assert.deepEqual(readWikiCache(memoryStorage()), {
    pages: {},
    indexTitles: [],
    syncedAt: null,
  });
});
