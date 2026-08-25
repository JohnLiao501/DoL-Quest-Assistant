import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.DOL_HELPER_PORT || 4317);
const APP_URL = `http://127.0.0.1:${PORT}`;
const SERVICE_ID = "dol-quest-assistant";
const NODE_MAJOR = Number(process.versions.node.split(".")[0]);
const BACKGROUND = process.argv.includes("--background");
const NO_BROWSER = process.argv.includes("--no-browser") || process.env.DOL_HELPER_NO_BROWSER === "1";
const LOG_DIR = join(ROOT, "logs");
const LOG_FILE = join(LOG_DIR, "startup.log");
const LOCK_FILE = join(LOG_DIR, `launcher-${PORT}.lock`);

mkdirSync(LOG_DIR, { recursive: true });

function record(message) {
  appendFileSync(LOG_FILE, `[${new Date().toLocaleString("zh-CN")}] ${message}\n`, "utf8");
}

function report(message, error = false) {
  record(message);
  if (!BACKGROUND) (error ? console.error : console.log)(message);
}

function processIsRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function acquireLauncherLock() {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = openSync(LOCK_FILE, "wx");
      try {
        writeFileSync(handle, `${process.pid}\n`, "utf8");
      } finally {
        closeSync(handle);
      }
      return true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      let ownerPid;
      try {
        ownerPid = Number.parseInt(readFileSync(LOCK_FILE, "utf8"), 10);
      } catch (readError) {
        if (readError?.code === "ENOENT") continue;
        throw readError;
      }
      if (processIsRunning(ownerPid)) return false;
      try {
        unlinkSync(LOCK_FILE);
      } catch (unlinkError) {
        if (unlinkError?.code !== "ENOENT") throw unlinkError;
      }
    }
  }
  return false;
}

function releaseLauncherLock() {
  try {
    const ownerPid = Number.parseInt(readFileSync(LOCK_FILE, "utf8"), 10);
    if (ownerPid === process.pid) unlinkSync(LOCK_FILE);
  } catch (error) {
    if (error?.code !== "ENOENT") report(`清理启动锁失败：${error.message || error}`, true);
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const logHandle = BACKGROUND ? openSync(LOG_FILE, "a") : null;
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: BACKGROUND ? ["ignore", logHandle, logHandle] : "inherit",
      windowsHide: BACKGROUND,
    });
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      if (logHandle !== null) closeSync(logHandle);
      callback();
    };
    child.once("error", (error) => finish(() => reject(error)));
    child.once("exit", (code, signal) => {
      finish(() => {
        if (code === 0) resolve();
        else reject(new Error(`${command} 运行失败（退出码：${code ?? signal ?? "未知"}）`));
      });
    });
  });
}

function runNpm(args) {
  if (process.platform !== "win32") return run("npm", args);
  const commandInterpreter = process.env.ComSpec || "cmd.exe";
  return run(commandInterpreter, ["/d", "/s", "/c", "npm.cmd", ...args]);
}

function dispatchDetached(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

async function waitForPageConnection(timeoutMs = 6_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${APP_URL}/api/health`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok && (await response.json())?.activePages > 0) return true;
    } catch {
      // 浏览器页面或本地服务仍在建立连接。
    }
    await delay(250);
  }
  return false;
}

async function openBrowser() {
  if (NO_BROWSER) return;

  const methods = [
    ["cmd.exe", ["/d", "/c", "start", "", APP_URL]],
    ["explorer.exe", [APP_URL]],
  ];

  let lastError = null;
  for (const [command, args] of methods) {
    try {
      await dispatchDetached(command, args);
      if (await waitForPageConnection()) return;
      lastError = new Error(`${command} 未能打开任务助手页面。`);
      record(`${lastError.message} 正在尝试兼容方式。`);
    } catch (error) {
      lastError = error;
      record(`调用 ${command} 失败：${error.message || error}`);
    }
  }

  throw new Error(`本地服务已启动，但无法自动打开浏览器。请手动访问 ${APP_URL}\n${lastError?.message || ""}`);
}

async function completeStartup() {
  await openBrowser();
  report(NO_BROWSER ? "启动完成。" : "启动完成，浏览器已打开；本窗口即将自动关闭……");
  if (!BACKGROUND) await delay(1_500);
}

async function helperIsRunning() {
  try {
    const response = await fetch(`${APP_URL}/api/health`, { signal: AbortSignal.timeout(1_500) });
    if (!response.ok) return false;
    const payload = await response.json();
    if (payload?.ok !== true || payload?.serviceId !== SERVICE_ID) return false;
    await fetch(`${APP_URL}/api/session/launch`, {
      method: "POST",
      signal: AbortSignal.timeout(1_500),
    }).catch(() => null);
    return true;
  } catch {
    return false;
  }
}

async function waitForHelper(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await helperIsRunning()) return true;
    await delay(500);
  }
  return false;
}

function spawnServer() {
  const logHandle = openSync(LOG_FILE, "a");
  let child;
  try {
    child = spawn(process.execPath, ["server.mjs", "--no-open"], {
      cwd: ROOT,
      detached: true,
      stdio: ["ignore", logHandle, logHandle],
      windowsHide: true,
    });
  } finally {
    closeSync(logHandle);
  }

  const state = { error: null };
  child.once("error", (error) => {
    state.error = error;
  });
  return { child, state };
}

async function waitForStartedServer(serverProcess, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (serverProcess.state.error) throw serverProcess.state.error;
    if (serverProcess.child.exitCode !== null) {
      throw new Error(`本地服务启动失败（退出码：${serverProcess.child.exitCode}）。`);
    }
    if (await helperIsRunning()) return;
    await delay(250);
  }
  throw new Error("本地服务未能在 30 秒内启动，请查看启动日志。");
}

async function main() {
  report("正在启动欲都孤儿任务助手……");

  if (!Number.isFinite(NODE_MAJOR) || NODE_MAJOR < 20) {
    throw new Error(`当前 Node.js 版本为 ${process.versions.node}，请安装 Node.js 20 或更高版本。`);
  }

  if (await helperIsRunning()) {
    report(`任务助手已经在运行：${APP_URL}`);
    await completeStartup();
    return;
  }

  if (!acquireLauncherLock()) {
    report("另一个启动进程正在准备任务助手，等待其完成……");
    if (await waitForHelper()) {
      await completeStartup();
      return;
    }
    throw new Error("等待另一个启动进程超时，请查看启动日志后重试。");
  }

  try {
    if (await helperIsRunning()) {
      report(`任务助手已经在运行：${APP_URL}`);
      await completeStartup();
      return;
    }

    if (!existsSync(join(ROOT, "node_modules"))) {
      report("首次启动，正在安装本地界面依赖……");
      await runNpm(["install"]);
    }

    report("正在检查并构建任务助手……");
    await runNpm(["run", "build"]);

    report(`正在启动本地服务：${APP_URL}`);
    const serverProcess = spawnServer();
    try {
      await waitForStartedServer(serverProcess);
    } catch (error) {
      if (serverProcess.child.exitCode === null) serverProcess.child.kill();
      throw error;
    }
    serverProcess.child.unref();
    await completeStartup();
  } finally {
    releaseLauncherLock();
  }
}

main().catch((error) => {
  report(`启动失败：${error?.stack || error?.message || error}`, true);
  process.exitCode = 1;
});
