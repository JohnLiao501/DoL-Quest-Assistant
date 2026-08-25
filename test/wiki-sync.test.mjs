import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function availablePort() {
  const server = createNetServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForHealth(baseUrl) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // 测试服务仍在启动。
    }
    await delay(100);
  }
  throw new Error("测试服务未能及时启动。");
}

test("Wiki 索引被连接验证拦截时保留实时页面，并正确标记缓存来源", { timeout: 20_000 }, async () => {
  const upstreamPort = await availablePort();
  let upstreamMode = "index-blocked";
  const challenge = "<!doctype html><title>Checking your connection...</title><p>unusual activity</p>";
  const upstream = createHttpServer((req, res) => {
    const requestUrl = new URL(req.url, `http://127.0.0.1:${upstreamPort}`);
    const action = requestUrl.searchParams.get("action");
    if (upstreamMode === "all-blocked" || action === "parse") {
      res.writeHead(403, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(challenge);
    }
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    return res.end(JSON.stringify({
      query: {
        pages: [{
          pageid: 1,
          title: "农场袭击",
          fullurl: "https://example.test/wiki/farm",
          extract: "实时攻略摘要",
          revisions: [{ timestamp: "2026-08-25T00:00:00Z" }],
        }],
      },
    }));
  });
  await new Promise((resolve, reject) => {
    upstream.once("error", reject);
    upstream.listen(upstreamPort, "127.0.0.1", resolve);
  });

  const tempDirectory = await mkdtemp(join(tmpdir(), "dol-wiki-sync-"));
  const cacheFile = join(tempDirectory, "wiki-cache.json");
  await writeFile(cacheFile, JSON.stringify({
    updatedAt: "2026-08-24T12:00:00Z",
    pages: {
      "农场袭击": {
        title: "农场袭击",
        url: "https://example.test/wiki/farm",
        extract: "缓存攻略摘要",
        revisionAt: "2026-08-24T00:00:00Z",
      },
    },
    indexTitles: ["缓存任务索引"],
  }), "utf8");

  const appPort = await availablePort();
  const baseUrl = `http://127.0.0.1:${appPort}`;
  const child = spawn(process.execPath, ["server.mjs", "--no-open"], {
    cwd: ROOT,
    env: {
      ...process.env,
      DOL_HELPER_PORT: String(appPort),
      DOL_HELPER_STARTUP_GRACE_MS: "60000",
      DOL_HELPER_CACHE_FILE: cacheFile,
      DOL_HELPER_WIKI_API_URL: `http://127.0.0.1:${upstreamPort}/api.php`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const exited = new Promise((resolve) => child.once("exit", resolve));

  try {
    await waitForHealth(baseUrl);
    const partial = await (await fetch(`${baseUrl}/api/wiki?titles=${encodeURIComponent("农场袭击")}`)).json();
    assert.equal(partial.source, "partial");
    assert.equal(partial.pageSource, "live");
    assert.equal(partial.indexSource, "cache");
    assert.equal(partial.pages["农场袭击"].extract, "实时攻略摘要");
    assert.deepEqual(partial.indexTitles, ["缓存任务索引"]);
    assert.match(partial.warning, /连接验证（403）/);

    upstreamMode = "all-blocked";
    const cached = await (await fetch(`${baseUrl}/api/wiki?titles=${encodeURIComponent("农场袭击")}`)).json();
    assert.equal(cached.source, "cache");
    assert.equal(cached.pageSource, "cache");
    assert.equal(cached.indexSource, "cache");
    assert.equal(cached.pages["农场袭击"].extract, "实时攻略摘要");
    assert.match(cached.warning, /实时同步暂不可用/);
    assert.match(cached.warning, /已使用本地缓存/);
  } catch (error) {
    error.message += `\n服务输出：\n${output}`;
    throw error;
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await Promise.race([exited, delay(2_000)]);
    await new Promise((resolve) => upstream.close(resolve));
    await rm(tempDirectory, { recursive: true, force: true });
  }
});
