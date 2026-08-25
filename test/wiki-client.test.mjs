import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchWikiIndex,
  fetchWikiPages,
  fetchWikiQuestData,
  WikiClientError,
} from "../src/lib/wiki-client.js";

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

test("攻略页面请求使用匿名 CORS 参数且不添加自定义请求头", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: new URL(url), options });
    return jsonResponse({ query: { pages: [] } });
  };

  await fetchWikiPages(["农场袭击", "农场袭击", "悉尼"], {
    apiUrl: "https://wiki.example.test/w/api.php",
    fetchImpl,
    timeoutMs: 1_000,
  });

  assert.equal(calls.length, 1);
  const [{ url, options }] = calls;
  assert.equal(url.searchParams.get("origin"), "*");
  assert.equal(url.searchParams.get("action"), "query");
  assert.equal(url.searchParams.get("redirects"), "1");
  assert.equal(url.searchParams.get("prop"), "extracts|info|revisions");
  assert.equal(url.searchParams.get("titles"), "农场袭击|悉尼");
  assert.equal(options.credentials, "omit");
  assert.ok(options.signal instanceof AbortSignal);
  assert.equal("headers" in options, false);
});

test("攻略页面结果跳过 missing 页面并为重定向标题建立同形映射", async () => {
  const fetchImpl = async () => jsonResponse({
    query: {
      pages: [
        {
          pageid: 1,
          title: "农场袭击",
          fullurl: "https://wiki.example.test/wiki/farm",
          extract: "  第一段\n\n第二段  ",
          revisions: [{ timestamp: "2026-08-25T01:02:03Z" }],
        },
        { ns: 0, title: "不存在页面", missing: true },
      ],
      redirects: [{ from: "农场任务", to: "农场袭击" }],
    },
  });

  const pages = await fetchWikiPages(["农场任务", "不存在页面"], { fetchImpl });
  assert.deepEqual(Object.keys(pages).sort(), ["农场任务", "农场袭击"]);
  assert.deepEqual(pages["农场袭击"], {
    title: "农场袭击",
    url: "https://wiki.example.test/wiki/farm",
    extract: "第一段 第二段",
    revisionAt: "2026-08-25T01:02:03Z",
  });
  assert.strictEqual(pages["农场任务"], pages["农场袭击"]);
  assert.equal(pages["不存在页面"], undefined);
});

test("任务索引仅保留主命名空间标题并去重", async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url: new URL(url), options };
    return jsonResponse({
      parse: {
        links: [
          { ns: 0, title: "农场袭击" },
          { ns: 10, title: "模板:其它" },
          { ns: 0, title: "悉尼" },
          { ns: 0, title: "农场袭击" },
        ],
      },
    });
  };

  const indexTitles = await fetchWikiIndex({ fetchImpl });
  assert.deepEqual(indexTitles, ["农场袭击", "悉尼"]);
  assert.equal(request.url.searchParams.get("origin"), "*");
  assert.equal(request.url.searchParams.get("action"), "parse");
  assert.equal(request.url.searchParams.get("page"), "模板:Navbox Quests");
  assert.equal(request.options.credentials, "omit");
  assert.equal("headers" in request.options, false);
});

test("组合读取返回与本地服务一致的 pages 和 indexTitles 结构", async () => {
  const fetchImpl = async (url) => {
    const action = new URL(url).searchParams.get("action");
    if (action === "parse") {
      return jsonResponse({ parse: { links: [{ ns: 0, title: "任务甲" }] } });
    }
    return jsonResponse({ query: { pages: [{ title: "任务甲", extract: "攻略" }] } });
  };

  const result = await fetchWikiQuestData(["任务甲"], { fetchImpl });
  assert.deepEqual(result.indexTitles, ["任务甲"]);
  assert.equal(result.pages["任务甲"].extract, "攻略");
});

test("HTTP 403 与浏览器网络或 CORS 错误可被明确区分", async () => {
  await assert.rejects(
    fetchWikiPages(["农场袭击"], {
      fetchImpl: async () => new Response("blocked", { status: 403 }),
    }),
    (error) => {
      assert.ok(error instanceof WikiClientError);
      assert.equal(error.code, "WIKI_HTTP_403");
      assert.equal(error.status, 403);
      assert.match(error.message, /HTTP 403/);
      return true;
    },
  );

  await assert.rejects(
    fetchWikiIndex({
      fetchImpl: async () => { throw new TypeError("Failed to fetch"); },
    }),
    (error) => {
      assert.ok(error instanceof WikiClientError);
      assert.equal(error.code, "WIKI_NETWORK_OR_CORS");
      assert.equal(error.status, null);
      assert.match(error.message, /网络中断或浏览器跨域（CORS）限制/);
      return true;
    },
  );
});
