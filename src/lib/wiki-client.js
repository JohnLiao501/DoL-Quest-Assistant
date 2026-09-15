import { toEnglishWikiTitle, toChineseWikiTitle } from "./localization.js";

const DEFAULT_WIKI_API_URL = "https://degreesoflewditycn.miraheze.org/w/api.php";
const EN_WIKI_API_URL = "https://degreesoflewdity.miraheze.org/w/api.php";
const DEFAULT_TIMEOUT_MS = 15_000;
const TITLES_PER_REQUEST = 40;

export class WikiClientError extends Error {
  constructor(message, { code, status = null, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "WikiClientError";
    this.code = code || "WIKI_ERROR";
    this.status = status;
  }
}

function buildApiUrl(apiUrl, parameters) {
  const url = new URL(apiUrl);
  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.set(key, value);
  }
  // MediaWiki 要求跨站匿名请求显式声明来源；星号表示不携带身份凭据。
  url.searchParams.set("origin", "*");
  return url.toString();
}

async function requestJson(url, label, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new WikiClientError("当前浏览器不支持联网读取攻略。", {
      code: "WIKI_FETCH_UNAVAILABLE",
    });
  }

  const controller = new AbortController();
  const shouldTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0;
  const timer = shouldTimeout
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  let response;
  try {
    response = await fetchImpl(url, {
      credentials: "omit",
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new WikiClientError(`${label}超时，请稍后重试。`, {
        code: "WIKI_TIMEOUT",
        cause: error,
      });
    }
    if (error instanceof TypeError) {
      throw new WikiClientError(
        `${label}无法连接攻略站，可能是网络中断或浏览器跨域（CORS）限制。`,
        { code: "WIKI_NETWORK_OR_CORS", cause: error },
      );
    }
    throw new WikiClientError(`${label}连接失败，请稍后重试。`, {
      code: "WIKI_NETWORK_ERROR",
      cause: error,
    });
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!response.ok) {
    if (response.status === 403) {
      throw new WikiClientError(
        `${label}被攻略站拒绝（HTTP 403），网站可能仍在进行连接验证。`,
        { code: "WIKI_HTTP_403", status: 403 },
      );
    }
    throw new WikiClientError(
      `${label}失败（HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}）。`,
      { code: "WIKI_HTTP_ERROR", status: response.status },
    );
  }

  try {
    const payload = await response.json();
    if (payload?.error) {
      throw new WikiClientError(
        `${label}失败：${payload.error.info || payload.error.code || "攻略站返回了未知错误"}。`,
        { code: "WIKI_API_ERROR" },
      );
    }
    return payload;
  } catch (error) {
    if (error instanceof WikiClientError) throw error;
    throw new WikiClientError(`${label}返回的数据无法读取。`, {
      code: "WIKI_INVALID_RESPONSE",
      cause: error,
    });
  }
}

function cleanTitles(titles) {
  return [...new Set(
    (Array.isArray(titles) ? titles : [])
      .map((title) => String(title || "").trim())
      .filter(Boolean),
  )];
}

async function fetchFromApi(titles, { apiUrl, fetchImpl, timeoutMs, sourceWiki, label }) {
  const pages = {};
  const redirects = [];
  const baseWikiUrl = apiUrl.replace(/\/w\/api\.php.*$/, "/wiki/");

  for (let start = 0; start < titles.length; start += TITLES_PER_REQUEST) {
    const batch = titles.slice(start, start + TITLES_PER_REQUEST);
    const url = buildApiUrl(apiUrl, {
      action: "query",
      format: "json",
      formatversion: "2",
      redirects: "1",
      prop: "extracts|info|revisions",
      explaintext: "1",
      exintro: "1",
      inprop: "url",
      rvprop: "timestamp",
      titles: batch.join("|"),
    });
    const payload = await requestJson(url, label, { fetchImpl, timeoutMs });

    for (const page of payload.query?.pages || []) {
      if (page.missing) continue;
      const extract = String(page.extract || "").replace(/\s+/g, " ").trim();
      const pageData = {
        title: page.title,
        url: page.fullurl
          || `${baseWikiUrl}${encodeURIComponent(page.title)}`,
        extract: extract.slice(0, 900),
        revisionAt: page.revisions?.[0]?.timestamp || null,
      };
      if (sourceWiki === "en") {
        pageData.sourceWiki = "en";
      }
      pages[page.title] = pageData;
    }
    redirects.push(...(payload.query?.redirects || []));
  }

  for (const redirect of redirects) {
    if (pages[redirect.to]) pages[redirect.from] = pages[redirect.to];
  }
  return pages;
}

/**
 * 从官方 MediaWiki Action API 批量读取攻略页。
 * 设置 fallbackToEn: true 时，中文 Wiki 缺失的条目会自动向英文 Wiki 补拉。
 */
export async function fetchWikiPages(titles, {
  apiUrl = DEFAULT_WIKI_API_URL,
  enApiUrl = EN_WIKI_API_URL,
  fallbackToEn = false,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const requestedTitles = cleanTitles(titles);
  if (!requestedTitles.length) return {};

  const isExplicitEn = apiUrl === EN_WIKI_API_URL
    || (!apiUrl.includes("degreesoflewditycn") && apiUrl.includes("degreesoflewdity"));
  const pages = await fetchFromApi(requestedTitles, {
    apiUrl,
    fetchImpl,
    timeoutMs,
    sourceWiki: isExplicitEn ? "en" : "cn",
    label: "攻略页面请求",
  });

  if (fallbackToEn && enApiUrl) {
    const missingTitles = requestedTitles.filter((title) => !pages[title]);
    if (missingTitles.length) {
      const enTitleMap = new Map();
      for (const title of missingTitles) {
        const enTitle = toEnglishWikiTitle(title);
        if (enTitle) enTitleMap.set(enTitle, title);
      }
      const uniqueEnTitles = [...enTitleMap.keys()];
      if (uniqueEnTitles.length) {
        try {
          const enPages = await fetchFromApi(uniqueEnTitles, {
            apiUrl: enApiUrl,
            fetchImpl,
            timeoutMs,
            sourceWiki: "en",
            label: "英文攻略页面请求",
          });
          for (const [enTitle, page] of Object.entries(enPages)) {
            const originalTitle = enTitleMap.get(enTitle);
            const cnTitle = toChineseWikiTitle(enTitle);
            if (originalTitle) pages[originalTitle] = page;
            if (cnTitle) pages[cnTitle] = page;
            pages[enTitle] = page;
          }
        } catch {
          // 英文兜底失败时不影响中文已有内容
        }
      }
    }
  }

  return pages;
}

/** 读取官方任务导航模板，支持聚合中文与英文导航索引并返回去重标题。 */
export async function fetchWikiIndex({
  apiUrl = DEFAULT_WIKI_API_URL,
  enApiUrl = EN_WIKI_API_URL,
  mergeEn = false,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const primaryPromise = (async () => {
    const url = buildApiUrl(apiUrl, {
      action: "parse",
      format: "json",
      formatversion: "2",
      page: apiUrl.includes("degreesoflewditycn") ? "模板:Navbox Quests" : "Template:Navbox Quests",
      prop: "links",
    });
    const payload = await requestJson(url, "任务索引请求", { fetchImpl, timeoutMs });
    return (payload.parse?.links || [])
      .filter((link) => link.ns === 0)
      .map((link) => link.title);
  })();

  if (!mergeEn || !enApiUrl) {
    const list = await primaryPromise;
    return [...new Set(list)];
  }

  const enPromise = (async () => {
    try {
      const url = buildApiUrl(enApiUrl, {
        action: "parse",
        format: "json",
        formatversion: "2",
        page: "Template:Navbox Quests",
        prop: "links",
      });
      const payload = await requestJson(url, "英文任务索引请求", { fetchImpl, timeoutMs });
      return (payload.parse?.links || [])
        .filter((link) => link.ns === 0)
        .map((link) => link.title);
    } catch {
      return [];
    }
  })();

  const [cnTitles, enTitles] = await Promise.all([primaryPromise, enPromise]);
  const localizedEn = enTitles.map((title) => toChineseWikiTitle(title));
  return [...new Set([...cnTitles, ...localizedEn])];
}

/** 同时读取当前存档所需攻略页和任务索引，默认开启英文智能兜底与索引聚合。 */
export async function fetchWikiQuestData(titles, options = {}) {
  const {
    fallbackToEn = true,
    mergeEn = true,
    ...restOptions
  } = options;
  const [pages, indexTitles] = await Promise.all([
    fetchWikiPages(titles, { fallbackToEn, ...restOptions }),
    fetchWikiIndex({ mergeEn, ...restOptions }),
  ]);
  return { pages, indexTitles };
}

export { DEFAULT_WIKI_API_URL, EN_WIKI_API_URL };

