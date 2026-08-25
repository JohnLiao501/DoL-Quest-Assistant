import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function availablePort() {
  const server = createServer();
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
      if (response.ok) return response.json();
    } catch {
      // 服务仍在启动。
    }
    await delay(100);
  }
  throw new Error("测试服务未能及时启动。");
}

async function openPageSession(baseUrl, clientId) {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/api/session/events?id=${clientId}`, {
    signal: controller.signal,
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/event-stream/);
  const reader = response.body.getReader();
  const firstMessage = await reader.read();
  assert.equal(firstMessage.done, false);
  return {
    close: async () => {
      await reader.cancel();
      controller.abort();
    },
  };
}

test("最后一个页面断开后服务退出，多页面和短暂重连互不影响", { timeout: 15_000 }, async () => {
  const port = await availablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server.mjs", "--no-open"], {
    cwd: ROOT,
    env: {
      ...process.env,
      DOL_HELPER_PORT: String(port),
      DOL_HELPER_STARTUP_GRACE_MS: "2_000".replace("_", ""),
      DOL_HELPER_IDLE_SHUTDOWN_MS: "300",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const exited = new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));

  try {
    const health = await waitForHealth(baseUrl);
    assert.equal(health.serviceId, "dol-quest-assistant");
    assert.equal(health.apiVersion, 1);
    const firstPage = await openPageSession(baseUrl, "page_session_one");
    const secondPage = await openPageSession(baseUrl, "page_session_two");

    const twoPages = await (await fetch(`${baseUrl}/api/health`)).json();
    assert.equal(twoPages.activePages, 2);

    await firstPage.close();
    await delay(150);
    const onePage = await (await fetch(`${baseUrl}/api/health`)).json();
    assert.equal(onePage.activePages, 1);

    await secondPage.close();
    await delay(150);
    const refreshedPage = await openPageSession(baseUrl, "page_session_after_refresh");
    await delay(250);
    const afterRefresh = await (await fetch(`${baseUrl}/api/health`)).json();
    assert.equal(afterRefresh.activePages, 1);

    await refreshedPage.close();
    const result = await Promise.race([
      exited,
      delay(4_000).then(() => ({ timeout: true })),
    ]);
    assert.equal(result.timeout, undefined, `服务未自动退出：\n${output}`);
    assert.equal(result.code, 0, `服务异常退出：\n${output}`);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
});
