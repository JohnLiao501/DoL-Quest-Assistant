import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  Download,
  ExternalLink,
  FileArchive,
  FileUp,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Repeat2,
  Route,
  ShieldCheck,
  Undo2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { analyzeQuests, getWikiTitles } from "./lib/quest-analyzer.js";
import { localizeKnownTerms, localizePassage, localizeWikiTitle } from "./lib/localization.js";
import { parseDoLSaveText } from "./lib/save-parser.js";
import { fetchWikiIndex, fetchWikiPages } from "./lib/wiki-client.js";

const FILTERS = [
  { id: "overview", label: "任务概览", icon: ListChecks },
  { id: "incomplete", label: "未完成", icon: Clock3 },
  { id: "locked", label: "尚未解锁", icon: LockKeyhole },
  { id: "uncertain", label: "需要确认", icon: CircleHelp },
  { id: "completed", label: "已完成", icon: CheckCircle2 },
  { id: "seasonal", label: "季节任务", icon: CalendarDays },
  { id: "alternate", label: "互斥路线", icon: Route },
  { id: "recurring", label: "重复事件", icon: Repeat2 },
];

const STATUS_META = {
  incomplete: { label: "未完成", icon: Clock3 },
  locked: { label: "尚未解锁", icon: LockKeyhole },
  uncertain: { label: "需要确认", icon: CircleHelp },
  completed: { label: "已完成", icon: CheckCircle2 },
  seasonal: { label: "季节任务", icon: CalendarDays },
  alternate: { label: "互斥路线", icon: Route },
  recurring: { label: "重复事件", icon: Repeat2 },
};

function readOverrides(profileKey) {
  try {
    return JSON.parse(localStorage.getItem(`dol-quest-overrides:v1:${profileKey}`) || "{}");
  } catch {
    return {};
  }
}

function formatSyncTime(value) {
  if (!value) return "尚未同步";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

async function loadWikiCache(titles) {
  const response = await fetch(
    `/api/wiki?cacheOnly=1&titles=${encodeURIComponent(titles.join("|"))}`,
  );
  if (!response.ok) throw new Error(`本地缓存服务返回 ${response.status}`);
  return response.json();
}

async function persistWikiCache(update) {
  const response = await fetch("/api/wiki/cache", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `本地缓存服务返回 ${response.status}`);
  }
  return response.json();
}

function makeMarkdown(parsed, quests, wiki) {
  const groupOrder = ["incomplete", "locked", "uncertain", "seasonal", "completed", "alternate", "recurring"];
  const lines = [
    "# 欲都孤儿任务清单",
    "",
    `- 存档：${parsed.fileName}`,
    `- 角色：${parsed.profileName}`,
    `- 游戏版本：${parsed.gameVersion}`,
    `- 当前场景：${localizePassage(parsed.passage)}`,
    `- 攻略同步：${wiki.source === "live" ? "在线中文攻略" : wiki.source === "partial" ? "部分在线、部分缓存" : wiki.source === "cache" ? "本地缓存" : "未连接"}`,
    "",
  ];

  for (const status of groupOrder) {
    const items = quests.filter((item) => item.status === status);
    if (!items.length) continue;
    lines.push(`## ${STATUS_META[status].label}`, "");
    for (const item of items) {
      const checkbox = status === "completed" ? "x" : " ";
      lines.push(`- [${checkbox}] **${item.title}**`);
      lines.push(`  - 当前状态：${item.current}`);
      for (const action of item.next || []) lines.push(`  - [ ] ${action}`);
      const source = wiki.pages?.[item.wikiTitle]?.url || item.wikiUrl;
      if (source) lines.push(`  - 攻略来源：${source}`);
      lines.push("");
    }
  }

  lines.push("> 任务判定以存档变量和当前游戏逻辑为主；中文攻略站可能落后于游戏版本。", "");
  return lines.join("\n");
}

function downloadText(fileName, text) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function UploadPanel({ parsed, busy, onFile }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  function acceptFiles(files) {
    const file = files?.[0];
    if (file) onFile(file);
  }

  return (
    <section
      className={`upload-panel ${dragging ? "is-dragging" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        acceptFiles(event.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept=".save,text/plain"
        aria-label="选择存档文件"
        onChange={(event) => acceptFiles(event.target.files)}
      />
      <div className="upload-intro">
        <FileUp aria-hidden="true" />
        <div>
          <h1>{busy ? "正在核验存档…" : "把存档拖到这里"}</h1>
          <p>存档只在本机解析，不会上传</p>
          <button className="primary-button" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <LoaderCircle className="spin" aria-hidden="true" /> : null}
            选择存档
          </button>
        </div>
      </div>
      <div className="file-summary" aria-live="polite">
        {parsed ? (
          <>
            <FileArchive aria-hidden="true" />
            <div>
              <strong>{parsed.fileName}</strong>
              <span>角色：{parsed.profileName}</span>
              <span>游戏版本：{parsed.gameVersion} · 当前场景：{localizePassage(parsed.passage)}</span>
            </div>
          </>
        ) : (
          <div className="empty-file-summary">
            <span>支持游戏内“保存到磁盘”导出的 .save 文件</span>
            <span>不会修改原存档</span>
          </div>
        )}
      </div>
    </section>
  );
}

function SyncBar({ wiki, onRefresh, disabled }) {
  const live = wiki.source === "live";
  const partial = wiki.source === "partial";
  const cached = wiki.source === "cache";
  const indexSource = wiki.indexSource || (live ? "live" : cached ? "cache" : "offline");
  return (
    <div className="sync-bar">
      <div className={`sync-state ${wiki.loading ? "is-loading" : ""}`}>
        {wiki.loading ? (
          <LoaderCircle className="spin" aria-hidden="true" />
        ) : live || partial || cached ? (
          <Wifi aria-hidden="true" />
        ) : (
          <WifiOff aria-hidden="true" />
        )}
        <span>
          {wiki.loading
            ? "正在同步欲都孤儿中文攻略站…"
            : live
              ? `攻略已于 ${formatSyncTime(wiki.syncedAt)} 实时同步`
              : partial
                ? `部分攻略已于 ${formatSyncTime(wiki.syncedAt)} 实时同步`
              : cached
                ? `实时连接失败，使用 ${formatSyncTime(wiki.syncedAt)} 的缓存`
                : "尚未连接中文攻略站"}
          {!wiki.loading && wiki.indexTitles?.length
            ? ` · ${indexSource === "live" ? "在线" : "缓存"}任务索引 ${wiki.indexTitles.length} 页`
            : ""}
        </span>
        <button className="icon-text-button" type="button" disabled={disabled || wiki.loading} onClick={onRefresh}>
          <RefreshCw aria-hidden="true" />
          刷新攻略
        </button>
      </div>
      <div className="version-warning">
        <AlertTriangle aria-hidden="true" />
        <span>中文攻略内容可能滞后于当前游戏版本，冲突时以存档和本地游戏逻辑为准。</span>
      </div>
      {wiki.warning ? <p className="sync-warning-detail">{wiki.warning}</p> : null}
    </div>
  );
}

function SummaryStrip({ counts }) {
  return (
    <div className="summary-strip" aria-label="任务状态统计">
      {(["incomplete", "locked", "uncertain", "completed"]).map((status) => {
        const meta = STATUS_META[status];
        const Icon = meta.icon;
        return (
          <div className={`summary-item status-${status}`} key={status}>
            <Icon aria-hidden="true" />
            <span>{meta.label}</span>
            <strong>{counts[status] || 0}</strong>
          </div>
        );
      })}
    </div>
  );
}

function SideRail({ active, counts, onChange }) {
  return (
    <nav className="side-rail" aria-label="任务筛选">
      {FILTERS.map((filter) => {
        const Icon = filter.icon;
        const count = filter.id === "overview" ? null : counts[filter.id] || 0;
        return (
          <button
            className={active === filter.id ? "is-active" : ""}
            key={filter.id}
            type="button"
            onClick={() => onChange(filter.id)}
          >
            <Icon aria-hidden="true" />
            <span>{filter.label}</span>
            {count !== null ? <small>{count}</small> : null}
          </button>
        );
      })}
    </nav>
  );
}

function TaskRow({ task, page, expanded, onExpand, onConfirm, onUndo }) {
  const meta = STATUS_META[task.status];
  const StatusIcon = meta.icon;
  const sourceUrl = page?.url || task.wikiUrl;
  return (
    <article className={`task-row status-${task.status}`}>
      <div className="task-main-grid">
        <div className="task-title-cell">
          <StatusIcon className="task-status-icon" aria-hidden="true" />
          <div>
            <h3>{task.title}</h3>
            <span>{task.category}</span>
          </div>
        </div>
        <div className="task-current-cell">
          {task.progress ? (
            <div className="progress-block">
              <strong>{task.progress.label}</strong>
              <div className="progress-track" aria-label={`${task.title}进度 ${task.progress.label}`}>
                <span style={{ width: `${Math.min(100, (task.progress.value / task.progress.max) * 100)}%` }} />
              </div>
            </div>
          ) : null}
          <p>{task.current}</p>
          {task.manualConfirmed ? <em>人工确认</em> : null}
        </div>
        <div className="task-next-cell">
          {task.next?.length ? (
            <ul>
              {task.next.slice(0, 3).map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          ) : (
            <span className="no-next"><Check aria-hidden="true" /> 无需继续处理</span>
          )}
        </div>
        <div className="task-source-cell">
          <a href={sourceUrl} target="_blank" rel="noreferrer">
            中文攻略：{localizeWikiTitle(page?.title || task.wikiTitle)}
            <ExternalLink aria-hidden="true" />
          </a>
          <button
            className="expand-button"
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? "收起核验依据" : "展开核验依据"}
            onClick={onExpand}
          >
            <ChevronDown aria-hidden="true" />
          </button>
        </div>
      </div>
      {expanded ? (
        <div className="evidence-panel">
          <div>
            <h4><ShieldCheck aria-hidden="true" /> 存档核验依据</h4>
            <ul>
              {task.evidence.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <div>
            <h4><Wifi aria-hidden="true" /> 在线攻略摘要</h4>
            <p>{page?.extract ? localizeKnownTerms(page.extract) : "中文攻略站没有返回这页的摘要；仍可打开页面查看完整攻略。"}</p>
            {page?.revisionAt ? <small>页面修订时间：{formatSyncTime(page.revisionAt)}</small> : null}
          </div>
          {task.status === "uncertain" ? (
            <button className="confirm-button" type="button" onClick={onConfirm}>
              <CheckCircle2 aria-hidden="true" /> 我已确认完成
            </button>
          ) : null}
          {task.manualConfirmed ? (
            <button className="undo-button" type="button" onClick={onUndo}>
              <Undo2 aria-hidden="true" /> 撤销人工确认
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function EmptyState({ filter }) {
  return (
    <div className="task-empty-state">
      <CheckCircle2 aria-hidden="true" />
      <h3>这一栏暂时没有任务</h3>
      <p>当前筛选：{FILTERS.find((item) => item.id === filter)?.label}</p>
    </div>
  );
}

export default function App() {
  const [parsed, setParsed] = useState(null);
  const [manualOverrides, setManualOverrides] = useState({});
  const [filter, setFilter] = useState("overview");
  const [expanded, setExpanded] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [exported, setExported] = useState(false);
  const [wiki, setWiki] = useState({
    source: "idle",
    pageSource: "offline",
    indexSource: "offline",
    syncedAt: null,
    pages: {},
    indexTitles: [],
    loading: false,
    warning: "",
  });

  const quests = useMemo(
    () => (parsed ? analyzeQuests(parsed, manualOverrides) : []),
    [parsed, manualOverrides],
  );

  const counts = useMemo(() => {
    const result = {};
    for (const task of quests) result[task.status] = (result[task.status] || 0) + 1;
    return result;
  }, [quests]);

  const visibleQuests = useMemo(() => {
    if (filter === "overview") {
      const actionable = quests.filter((task) => ["incomplete", "locked", "uncertain"].includes(task.status));
      return actionable.length ? actionable : quests;
    }
    return quests.filter((task) => task.status === filter);
  }, [filter, quests]);

  async function syncWiki() {
    setWiki((state) => ({ ...state, loading: true, warning: "" }));
    try {
      const titles = getWikiTitles();
      const [cacheResult, pageResult, indexResult] = await Promise.allSettled([
        loadWikiCache(titles),
        fetchWikiPages(titles),
        fetchWikiIndex(),
      ]);
      const cache = cacheResult.status === "fulfilled"
        ? cacheResult.value
        : { pages: {}, indexTitles: [], syncedAt: null };
      const livePages = pageResult.status === "fulfilled" ? pageResult.value : {};
      const cachedPages = cache.pages || {};
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
      const anyCache = pageSource === "cache" || indexSource === "cache";
      const source = pageSource === "live" && indexSource === "live"
        ? "live"
        : anyLive
          ? "partial"
          : anyCache ? "cache" : "offline";
      const syncedAt = anyLive ? new Date().toISOString() : cache.syncedAt;

      let cacheWarning = "";
      if (anyLive) {
        const update = {};
        if (pageResult.status === "fulfilled") update.pages = livePages;
        if (indexResult.status === "fulfilled") update.indexTitles = indexTitles;
        try {
          await persistWikiCache(update);
        } catch (cacheError) {
          cacheWarning = `实时内容已显示，但未能更新本地缓存：${cacheError.message || "未知错误"}。`;
        }
      }

      const failures = [pageResult, indexResult]
        .filter((result) => result.status === "rejected")
        .map((result) => String(result.reason?.message || "Wiki 请求失败").replace(/[。；]+$/g, ""));
      if (cacheResult.status === "rejected") {
        failures.push(`本地缓存读取失败：${cacheResult.reason?.message || "未知错误"}`);
      }
      const fallbackMessage = anyCache ? "已使用本地缓存。" : "请稍后重试。";
      const warning = failures.length
        ? `${anyLive ? "部分内容暂未实时更新" : "实时同步暂不可用"}：${failures.join("；")}。${fallbackMessage}${cacheWarning}`
        : cacheWarning;

      setWiki({
        source,
        pageSource,
        indexSource,
        syncedAt,
        pages,
        indexTitles,
        loading: false,
        warning,
      });
    } catch (syncError) {
      setWiki((state) => ({ ...state, source: "offline", loading: false, warning: syncError.message }));
    }
  }

  async function handleFile(file) {
    setBusy(true);
    setError("");
    try {
      if (!file.name.toLowerCase().endsWith(".save")) {
        throw new Error("请选择扩展名为 .save 的游戏存档。");
      }
      const text = await file.text();
      const nextParsed = parseDoLSaveText(text, file.name);
      setParsed(nextParsed);
      setManualOverrides(readOverrides(nextParsed.profileKey));
      setFilter("overview");
      setExpanded(new Set());
      await syncWiki();
    } catch (fileError) {
      setError(fileError.message || "存档解析失败。");
    } finally {
      setBusy(false);
    }
  }

  function updateOverride(taskId, confirmed) {
    if (!parsed) return;
    setManualOverrides((current) => {
      const next = { ...current };
      if (confirmed) next[taskId] = true;
      else delete next[taskId];
      localStorage.setItem(`dol-quest-overrides:v1:${parsed.profileKey}`, JSON.stringify(next));
      return next;
    });
  }

  function toggleExpanded(taskId) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function exportMarkdown() {
    if (!parsed) return;
    const safeName = parsed.profileName.replace(/[\\/:*?"<>|]/g, "-");
    downloadText(`${safeName}-欲都孤儿任务清单.md`, makeMarkdown(parsed, quests, wiki));
    setExported(true);
    window.setTimeout(() => setExported(false), 2_000);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">欲都孤儿 <span>任务助手</span></div>
        <div className={`source-status source-${wiki.source}`}>
          <span />
          攻略源：欲都孤儿中文攻略站
        </div>
      </header>

      <main>
        <UploadPanel parsed={parsed} busy={busy} onFile={handleFile} />
        {error ? <div className="error-banner" role="alert"><AlertTriangle aria-hidden="true" />{error}</div> : null}

        {parsed ? (
          <>
            <SyncBar wiki={wiki} disabled={!parsed} onRefresh={syncWiki} />
            <SummaryStrip counts={counts} />
            <div className="result-shell">
              <SideRail active={filter} counts={counts} onChange={setFilter} />
              <section className="task-region" aria-label="任务核验结果">
                <div className="task-table-header" aria-hidden="true">
                  <span>任务</span><span>当前状态</span><span>下一步行动</span><span>核验依据（来源）</span>
                </div>
                <div className="task-list">
                  {visibleQuests.length ? visibleQuests.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      page={wiki.pages?.[task.wikiTitle]}
                      expanded={expanded.has(task.id)}
                      onExpand={() => toggleExpanded(task.id)}
                      onConfirm={() => updateOverride(task.id, true)}
                      onUndo={() => updateOverride(task.id, false)}
                    />
                  )) : <EmptyState filter={filter} />}
                </div>
              </section>
            </div>
            <footer className="action-footer">
              <button className="secondary-button" type="button" onClick={() => setParsed(null)}>
                <RefreshCw aria-hidden="true" /> 重新分析
              </button>
              <button className="export-button" type="button" onClick={exportMarkdown}>
                {exported ? <Check aria-hidden="true" /> : <Download aria-hidden="true" />}
                {exported ? "清单已导出" : "导出文本清单"}
              </button>
            </footer>
          </>
        ) : (
          <section className="privacy-note">
            <ShieldCheck aria-hidden="true" />
            <div>
              <h2>本地解析，攻略联网</h2>
              <p>助手只读取存档中的任务变量；联网时仅查询公开的中文攻略页面，不会发送存档内容。</p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
