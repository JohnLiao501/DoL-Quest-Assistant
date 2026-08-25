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

test("浏览器实时攻略可安全写入磁盘缓存，并可只读缓存而不请求上游", { timeout: 20_000 }, async () => {
  const upstreamPort = await availablePort();
  let upstreamRequests = 0;
  const upstream = createHttpServer((req, res) => {
    upstreamRequests += 1;
    res.writeHead(403, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<title>Checking your connection...</title>");
  });
  await new Promise((resolve, reject) => {
    upstream.once("error", reject);
    upstream.listen(upstreamPort, "127.0.0.1", resolve);
  });

  const tempDirectory = await mkdtemp(join(tmpdir(), "dol-wiki-cache-"));
  const cacheFile = join(tempDirectory, "wiki-cache.json");
  await writeFile(cacheFile, JSON.stringify({
    updatedAt: "2026-08-24T12:00:00Z",
    pages: {},
    indexTitles: ["旧任务索引"],
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
    const initial = await (await fetch(
      `${baseUrl}/api/wiki?cacheOnly=1&titles=${encodeURIComponent("农场袭击")}`,
    )).json();
    assert.equal(initial.source, "cache");
    assert.equal(initial.pageSource, "offline");
    assert.equal(initial.indexSource, "cache");
    assert.deepEqual(initial.indexTitles, ["旧任务索引"]);
    assert.equal(upstreamRequests, 0);

    const livePage = {
      title: "农场袭击",
      url: "https://degreesoflewditycn.miraheze.org/wiki/%E5%86%9C%E5%9C%BA%E8%A2%AD%E5%87%BB",
      extract: "浏览器实时读取的攻略摘要",
      revisionAt: "2026-08-25T03:00:00Z",
    };
    const writeResponse = await fetch(`${baseUrl}/api/wiki/cache`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: baseUrl },
      body: JSON.stringify({ pages: { "农场袭击": livePage }, indexTitles: ["农场袭击", "分裂"] }),
    });
    assert.equal(writeResponse.status, 200);

    const cached = await (await fetch(
      `${baseUrl}/api/wiki?cacheOnly=1&titles=${encodeURIComponent("农场袭击")}`,
    )).json();
    assert.equal(cached.source, "cache");
    assert.equal(cached.pageSource, "cache");
    assert.equal(cached.pages["农场袭击"].extract, "浏览器实时读取的攻略摘要");
    assert.deepEqual(cached.indexTitles, ["农场袭击", "分裂"]);
    assert.equal(upstreamRequests, 0);

    const foreignOrigin = await fetch(`${baseUrl}/api/wiki/cache`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://example.test" },
      body: JSON.stringify({ indexTitles: ["不应写入"] }),
    });
    assert.equal(foreignOrigin.status, 403);

    const invalidUrl = await fetch(`${baseUrl}/api/wiki/cache`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: baseUrl },
      body: JSON.stringify({ pages: { "恶意页面": { ...livePage, url: "https://example.test/wiki/bad" } } }),
    });
    assert.equal(invalidUrl.status, 400);
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
