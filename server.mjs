import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const DIST = join(ROOT, "dist");
const CACHE_FILE = process.env.DOL_HELPER_CACHE_FILE
  ? resolve(process.env.DOL_HELPER_CACHE_FILE)
  : join(ROOT, "cache", "wiki-cache.json");
const CACHE_DIR = dirname(CACHE_FILE);
const WIKI_API_URL = process.env.DOL_HELPER_WIKI_API_URL
  || "https://degreesoflewditycn.miraheze.org/w/api.php";
const PORT = Number(process.env.DOL_HELPER_PORT || 4317);
const HOST = "127.0.0.1";
const SERVICE_ID = "dol-quest-assistant";
const isDev = process.argv.includes("--dev");
const STARTUP_GRACE_MS = Number(process.env.DOL_HELPER_STARTUP_GRACE_MS || 60_000);
const IDLE_SHUTDOWN_MS = Number(process.env.DOL_HELPER_IDLE_SHUTDOWN_MS || 8_000);

const activeClients = new Map();
let launchHoldUntil = Date.now() + STARTUP_GRACE_MS;
let shutdownTimer = null;
let shuttingDown = false;
let lastKeepAliveAt = 0;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function requestError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function readJsonBody(req, limit = 512 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw requestError("攻略缓存数据过大。", 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw requestError("攻略缓存数据不是有效的 JSON。", 400);
  }
}

function clientIdFrom(req) {
  const requestUrl = new URL(req.url, `http://${HOST}:${PORT}`);
  const clientId = requestUrl.searchParams.get("id") || "";
  return /^[a-zA-Z0-9_-]{8,100}$/.test(clientId) ? clientId : null;
}

function cancelScheduledShutdown() {
  if (!shutdownTimer) return;
  clearTimeout(shutdownTimer);
  shutdownTimer = null;
}

function shutdownWhenIdle() {
  if (isDev || shuttingDown || activeClients.size > 0 || Date.now() < launchHoldUntil) {
    cancelScheduledShutdown();
    return;
  }
  if (shutdownTimer) return;
  shutdownTimer = setTimeout(() => {
    if (activeClients.size > 0 || Date.now() < launchHoldUntil) {
      cancelScheduledShutdown();
      return;
    }
    shuttingDown = true;
    console.log("最后一个任务助手页面已关闭，本地服务正在退出。");
    clearInterval(lifecycleTimer);
    server.close(() => process.exit(0));
    server.closeIdleConnections?.();
    const forceExitTimer = setTimeout(() => {
      server.closeAllConnections?.();
      process.exit(0);
    }, 2_000);
    forceExitTimer.unref();
  }, IDLE_SHUTDOWN_MS);
  shutdownTimer.unref();
}

function holdForNewPage() {
  launchHoldUntil = Date.now() + STARTUP_GRACE_MS;
  cancelScheduledShutdown();
}

function handleClientEvents(req, res) {
  const clientId = clientIdFrom(req);
  if (!clientId) return sendJson(res, 400, { error: "无效的页面会话标识。" });

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  res.write(`retry: 1500\nevent: ready\ndata: ${JSON.stringify({ clientId })}\n\n`);

  const previous = activeClients.get(clientId);
  activeClients.set(clientId, res);
  launchHoldUntil = 0;
  cancelScheduledShutdown();
  if (previous && previous !== res) previous.end();

  const removeClient = () => {
    if (activeClients.get(clientId) === res) activeClients.delete(clientId);
    shutdownWhenIdle();
  };
  res.once("close", removeClient);
  res.once("error", removeClient);
}

const lifecycleTimer = setInterval(() => {
  if (Date.now() - lastKeepAliveAt >= 15_000) {
    lastKeepAliveAt = Date.now();
    for (const [clientId, response] of activeClients) {
      if (response.destroyed) {
        activeClients.delete(clientId);
        continue;
      }
      try {
        response.write(": keepalive\n\n");
      } catch {
        activeClients.delete(clientId);
      }
    }
  }
  shutdownWhenIdle();
}, 1_000);
lifecycleTimer.unref();

async function loadCache() {
  try {
    return JSON.parse(await readFile(CACHE_FILE, "utf8"));
  } catch {
    return { updatedAt: null, pages: {}, indexTitles: [] };
  }
}

async function saveCache(cache) {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateWikiUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname === "degreesoflewditycn.miraheze.org"
      && url.pathname.startsWith("/wiki/");
  } catch {
    return false;
  }
}

function normalizeCachedPage(key, page) {
  if (!isPlainObject(page)) throw requestError(`攻略页面“${key}”的数据格式无效。`);
  const title = String(page.title || "").trim();
  const extract = String(page.extract || "").replace(/\s+/g, " ").trim();
  const revisionAt = page.revisionAt == null ? null : String(page.revisionAt);
  if (!key || key.length > 200 || !title || title.length > 200) {
    throw requestError("攻略页面标题无效。");
  }
  if (!validateWikiUrl(page.url) || extract.length > 900 || (revisionAt && revisionAt.length > 64)) {
    throw requestError(`攻略页面“${key}”包含无效字段。`);
  }
  return { title, url: page.url, extract, revisionAt };
}

function normalizeCacheWrite(payload) {
  if (!isPlainObject(payload)) throw requestError("攻略缓存数据格式无效。");
  const result = {};
  if (payload.pages !== undefined) {
    if (!isPlainObject(payload.pages) || Object.keys(payload.pages).length > 80) {
      throw requestError("攻略页面缓存数量无效。");
    }
    result.pages = Object.fromEntries(
      Object.entries(payload.pages).map(([key, page]) => [key, normalizeCachedPage(key, page)]),
    );
  }
  if (payload.indexTitles !== undefined) {
    if (!Array.isArray(payload.indexTitles) || payload.indexTitles.length > 500) {
      throw requestError("任务索引缓存数量无效。");
    }
    const indexTitles = payload.indexTitles.map((title) => String(title).trim());
    if (indexTitles.some((title) => !title || title.length > 200)) {
      throw requestError("任务索引包含无效标题。");
    }
    result.indexTitles = [...new Set(indexTitles)];
  }
  if (result.pages === undefined && result.indexTitles === undefined) {
    throw requestError("没有可保存的攻略缓存数据。");
  }
  return result;
}

async function handleWikiCacheWrite(req, res) {
  const expectedOrigin = `http://${HOST}:${PORT}`;
  if (req.headers.origin && req.headers.origin !== expectedOrigin) {
    return sendJson(res, 403, { error: "拒绝来自其他网页的缓存写入。" });
  }
  if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    return sendJson(res, 415, { error: "攻略缓存写入必须使用 JSON。" });
  }
  const update = normalizeCacheWrite(await readJsonBody(req));
  const cache = await loadCache();
  const updatedAt = new Date().toISOString();
  await saveCache({
    updatedAt,
    pages: update.pages === undefined ? cache.pages || {} : { ...cache.pages, ...update.pages },
    indexTitles: update.indexTitles === undefined ? cache.indexTitles || [] : update.indexTitles,
  });
  return sendJson(res, 200, { ok: true, updatedAt });
}

async function throwWikiResponseError(response, label) {
  const body = await response.text().catch(() => "");
  const isConnectionCheck = response.status === 403
    && (response.headers.get("cf-mitigated") === "challenge"
      || /checking your connection|unusual activity/i.test(body));
  const error = new Error(
    isConnectionCheck
      ? `${label}触发了中文攻略站的连接验证（403）`
      : `${label}返回 ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
  );
  error.code = isConnectionCheck ? "WIKI_CONNECTION_CHECK" : "WIKI_HTTP_ERROR";
  throw error;
}

async function fetchWikiPages(titles) {
  const uniqueTitles = [...new Set(titles.filter(Boolean))].slice(0, 40);
  const api = new URL(WIKI_API_URL);
  api.searchParams.set("action", "query");
  api.searchParams.set("format", "json");
  api.searchParams.set("formatversion", "2");
  api.searchParams.set("redirects", "1");
  api.searchParams.set("prop", "extracts|info|revisions");
  api.searchParams.set("explaintext", "1");
  api.searchParams.set("exintro", "1");
  api.searchParams.set("inprop", "url");
  api.searchParams.set("rvprop", "timestamp");
  api.searchParams.set("titles", uniqueTitles.join("|"));

  const response = await fetch(api, {
    headers: {
      Accept: "application/json",
      "User-Agent": "DoL-Quest-Assistant/1.0 (local personal tool)",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    await throwWikiResponseError(response, "攻略页面请求");
  }

  const payload = await response.json();
  const pages = {};
  for (const page of payload.query?.pages || []) {
    if (page.missing) continue;
    const extract = String(page.extract || "").replace(/\s+/g, " ").trim();
    pages[page.title] = {
      title: page.title,
      url: page.fullurl || `https://degreesoflewditycn.miraheze.org/wiki/${encodeURIComponent(page.title)}`,
      extract: extract.slice(0, 900),
      revisionAt: page.revisions?.[0]?.timestamp || null,
    };
  }
  for (const redirect of payload.query?.redirects || []) {
    if (pages[redirect.to]) pages[redirect.from] = pages[redirect.to];
  }
  return pages;
}

async function fetchWikiIndex() {
  const api = new URL(WIKI_API_URL);
  api.searchParams.set("action", "parse");
  api.searchParams.set("format", "json");
  api.searchParams.set("formatversion", "2");
  api.searchParams.set("page", "模板:Navbox Quests");
  api.searchParams.set("prop", "links");
  const response = await fetch(api, {
    headers: {
      Accept: "application/json",
      "User-Agent": "DoL-Quest-Assistant/1.0 (local personal tool)",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) await throwWikiResponseError(response, "任务索引请求");
  const payload = await response.json();
  return [...new Set((payload.parse?.links || []).filter((link) => link.ns === 0).map((link) => link.title))];
}

async function handleWiki(req, res) {
  const requestUrl = new URL(req.url, `http://${HOST}:${PORT}`);
  const titles = (requestUrl.searchParams.get("titles") || "")
    .split("|")
    .map((title) => title.trim())
    .filter(Boolean);

  if (!titles.length) {
    return sendJson(res, 400, { error: "没有提供 Wiki 页面标题。" });
  }

  const cache = await loadCache();
  const cachedPages = Object.fromEntries(
    titles.filter((title) => cache.pages?.[title]).map((title) => [title, cache.pages[title]]),
  );
  if (requestUrl.searchParams.get("cacheOnly") === "1") {
    const pageSource = Object.keys(cachedPages).length ? "cache" : "offline";
    const indexTitles = cache.indexTitles || [];
    const indexSource = indexTitles.length ? "cache" : "offline";
    return sendJson(res, 200, {
      source: pageSource === "cache" || indexSource === "cache" ? "cache" : "offline",
      pageSource,
      indexSource,
      syncedAt: cache.updatedAt,
      pages: cachedPages,
      indexTitles,
      missing: titles.filter((title) => !cachedPages[title]),
      warning: "",
    });
  }
  const [pageResult, indexResult] = await Promise.allSettled([
    fetchWikiPages(titles),
    fetchWikiIndex(),
  ]);

  const livePages = pageResult.status === "fulfilled" ? pageResult.value : {};
  const pages = { ...cachedPages, ...livePages };
  const indexTitles = indexResult.status === "fulfilled"
    ? indexResult.value
    : cache.indexTitles || [];
  const pageSource = pageResult.status === "fulfilled"
    ? "live"
    : Object.keys(cachedPages).length ? "cache" : "offline";
  const indexSource = indexResult.status === "fulfilled"
    ? "live"
    : indexTitles.length ? "cache" : "offline";
  const anyLive = pageSource === "live" || indexSource === "live";
  const source = pageSource === "live" && indexSource === "live"
    ? "live"
    : anyLive
      ? "partial"
      : pageSource === "cache"
        ? "cache"
        : "offline";
  const now = new Date().toISOString();
  const syncedAt = anyLive ? now : cache.updatedAt;

  if (anyLive) {
    await saveCache({
      updatedAt: now,
      pages: { ...cache.pages, ...livePages },
      indexTitles,
    });
  }

  const rejectedResults = [pageResult, indexResult].filter((result) => result.status === "rejected");
  const failures = rejectedResults.map((result) => result.reason?.message || "Wiki 请求失败");
  const connectionCheck = rejectedResults.length > 0
    && rejectedResults.every((result) => result.reason?.code === "WIKI_CONNECTION_CHECK");
  const fallbackMessage = pageSource === "cache" || indexSource === "cache"
    ? "已使用本地缓存。"
    : "请稍后重试。";
  const warning = failures.length
    ? `${anyLive ? "部分内容暂未实时更新" : "实时同步暂不可用"}：${connectionCheck ? "中文攻略站正在进行连接验证（403）" : failures.join("；")}。${fallbackMessage}`
    : "";

  return sendJson(res, 200, {
    source,
    pageSource,
    indexSource,
    syncedAt,
    pages,
    indexTitles,
    missing: titles.filter((title) => !pages[title]),
    warning,
  });
}

function safeStaticPath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const candidate = resolve(DIST, `.${decoded}`);
  const resolvedDist = resolve(DIST);
  return candidate === resolvedDist || candidate.startsWith(`${resolvedDist}${sep}`) ? candidate : null;
}

async function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${HOST}:${PORT}`);
  let filePath = safeStaticPath(requestUrl.pathname);
  if (!filePath) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) filePath = join(filePath, "index.html");
  } catch {
    filePath = join(DIST, "index.html");
  }

  if (!existsSync(filePath)) {
    res.writeHead(404);
    return res.end("请先运行 npm run build");
  }

  res.writeHead(200, {
    "Content-Type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
  });
  createReadStream(filePath).pipe(res);
}

let vite;
if (isDev) {
  const { createServer } = await import("vite");
  vite = await createServer({ server: { middlewareMode: true }, appType: "spa" });
}

const server = createHttpServer(async (req, res) => {
  try {
    if (req.url === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        serviceId: SERVICE_ID,
        apiVersion: 1,
        service: "欲都孤儿任务助手",
        activePages: activeClients.size,
        shutdownPending: Boolean(shutdownTimer),
      });
    }
    if (req.method === "POST" && req.url === "/api/session/launch") {
      holdForNewPage();
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === "GET" && req.url?.startsWith("/api/session/events")) {
      return handleClientEvents(req, res);
    }
    if (req.method === "POST" && req.url?.startsWith("/api/session/close")) {
      const clientId = clientIdFrom(req);
      if (clientId) {
        activeClients.get(clientId)?.end();
        activeClients.delete(clientId);
      }
      shutdownWhenIdle();
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === "POST" && req.url === "/api/wiki/cache") {
      return await handleWikiCacheWrite(req, res);
    }
    if (req.method === "GET" && req.url?.startsWith("/api/wiki")) {
      return await handleWiki(req, res);
    }
    if (isDev) {
      return vite.middlewares(req, res);
    }
    return await serveStatic(req, res);
  } catch (error) {
    console.error(error);
    return sendJson(res, error.statusCode || 500, { error: error.message || "本地服务发生错误。" });
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`启动失败：端口 ${PORT} 已被其他程序占用。请关闭旧的任务助手窗口后重试。`);
  } else {
    console.error(`本地服务启动失败：${error.message || error}`);
  }
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  console.log(`欲都孤儿任务助手已启动：${url}`);
  if (!process.argv.includes("--no-open") && process.platform === "win32") {
    const child = spawn("cmd", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
  }
});
