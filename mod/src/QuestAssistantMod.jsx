import { useEffect, useMemo, useRef, useState } from "react";
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
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Repeat2,
  Route,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { analyzeQuests, getWikiTitles } from "../../src/lib/quest-analyzer.js";
import { localizeKnownTerms, localizePassage, localizeWikiTitle } from "../../src/lib/localization.js";
import { fetchWikiQuestData } from "../../src/lib/wiki-client.js";
import { readCurrentGameState, readManualOverrides, writeManualOverrides } from "./game-state.js";
import { readWikiCache, shouldRefreshWiki, writeWikiCache } from "./wiki-cache.js";

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

function formatTime(value) {
  if (!value) return "尚未同步";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "时间未知";
  }
}

function makeMarkdown(parsed, quests, wiki) {
  const lines = [
    "# 欲都孤儿任务清单",
    "",
    `- 角色：${parsed.profileName}`,
    `- 游戏版本：${parsed.gameVersion}`,
    `- 当前场景：${localizePassage(parsed.passage)}`,
    `- 攻略状态：${wiki.source === "live" ? "在线中文攻略" : wiki.source === "cache" ? "本地缓存" : "未连接"}`,
    "",
  ];
  const order = ["incomplete", "locked", "uncertain", "seasonal", "completed", "alternate", "recurring"];
  for (const status of order) {
    const items = quests.filter((item) => item.status === status);
    if (!items.length) continue;
    lines.push(`## ${STATUS_META[status].label}`, "");
    for (const item of items) {
      lines.push(`- [${status === "completed" ? "x" : " "}] **${item.title}**`);
      lines.push(`  - 当前状态：${item.current}`);
      for (const action of item.next || []) lines.push(`  - [ ] ${action}`);
      lines.push(`  - 攻略：${wiki.pages?.[item.wikiTitle]?.url || item.wikiUrl}`, "");
    }
  }
  lines.push("> 判定以当前存档变量和游戏逻辑为主；中文攻略内容可能落后于游戏版本。", "");
  return lines.join("\n");
}

function downloadMarkdown(parsed, quests, wiki) {
  const blob = new Blob([makeMarkdown(parsed, quests, wiki)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `欲都孤儿任务清单-${parsed.profileName}.md`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function SyncStatus({ wiki, onRefresh }) {
  const hasCache = Object.keys(wiki.pages || {}).length > 0;
  const connected = wiki.source === "live";
  return (
    <div className={`dqa-sync dqa-sync-${wiki.source}`}>
      <div className="dqa-sync-copy">
        {wiki.loading ? <LoaderCircle className="dqa-spin" /> : connected || hasCache ? <Wifi /> : <WifiOff />}
        <div>
          <strong>
            {wiki.loading
              ? "正在连接中文攻略站…"
              : connected
                ? `攻略已于 ${formatTime(wiki.syncedAt)} 同步`
                : hasCache
                  ? `实时连接不可用，正在使用 ${formatTime(wiki.syncedAt)} 的缓存`
                  : "尚未取得中文攻略内容"}
          </strong>
          <span>{wiki.error || `任务索引 ${wiki.indexTitles?.length || 0} 页 · 存档判定始终可用`}</span>
        </div>
      </div>
      <button type="button" onClick={onRefresh} disabled={wiki.loading}>
        <RefreshCw className={wiki.loading ? "dqa-spin" : ""} />
        刷新攻略
      </button>
    </div>
  );
}

function StatCard({ status, count }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <div className={`dqa-stat dqa-${status}`}>
      <Icon />
      <span>{meta.label}</span>
      <strong>{count}</strong>
    </div>
  );
}

function TaskRow({ task, page, expanded, onToggle, onConfirm, onUndo }) {
  const meta = STATUS_META[task.status];
  const Icon = meta.icon;
  const excerpt = localizeKnownTerms(page?.extract || "");
  return (
    <article className={`dqa-task dqa-task-${task.status}`}>
      <button className="dqa-task-main" type="button" onClick={onToggle} aria-expanded={expanded}>
        <span className="dqa-task-icon"><Icon /></span>
        <span className="dqa-task-copy">
          <span className="dqa-task-title-line">
            <strong>{task.title}</strong>
            <em>{meta.label}</em>
          </span>
          <span className="dqa-task-current">{task.current}</span>
          {task.progress ? (
            <span className="dqa-progress-row">
              <span className="dqa-progress"><i style={{ width: `${Math.min(100, (task.progress.value / task.progress.max) * 100)}%` }} /></span>
              <b>{task.progress.label}</b>
            </span>
          ) : null}
        </span>
        <ChevronDown className={expanded ? "dqa-chevron-open" : ""} />
      </button>
      {expanded ? (
        <div className="dqa-task-detail">
          {(task.next || []).length ? (
            <section>
              <h4>下一步</h4>
              <ul>{task.next.map((action) => <li key={action}>{action}</li>)}</ul>
            </section>
          ) : null}
          <section>
            <h4>核验依据</h4>
            <ul>{task.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
          {excerpt ? (
            <section className="dqa-wiki-excerpt">
              <h4>中文攻略摘要</h4>
              <p>{excerpt}</p>
            </section>
          ) : null}
          <div className="dqa-task-actions">
            <a href={page?.url || task.wikiUrl} target="_blank" rel="noreferrer">
              中文攻略：{localizeWikiTitle(page?.title || task.wikiTitle)} <ExternalLink />
            </a>
            {task.manualConfirmed ? (
              <button type="button" className="dqa-undo" onClick={onUndo}>撤销人工确认</button>
            ) : task.status === "uncertain" ? (
              <button type="button" className="dqa-confirm" onClick={onConfirm}><Check /> 我已完成</button>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}

export default function QuestAssistantMod() {
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState(() => readCurrentGameState());
  const [overrides, setOverrides] = useState(() => readManualOverrides());
  const [filter, setFilter] = useState("overview");
  const [expanded, setExpanded] = useState(() => new Set());
  const initialCache = useMemo(() => readWikiCache(), []);
  const [wiki, setWiki] = useState({
    ...initialCache,
    source: Object.keys(initialCache.pages).length ? "cache" : "offline",
    loading: false,
    error: null,
  });
  const autoRefreshAttempted = useRef(false);

  const quests = useMemo(
    () => parsed ? analyzeQuests(parsed, overrides) : [],
    [parsed, overrides],
  );
  const counts = useMemo(
    () => Object.fromEntries(Object.keys(STATUS_META).map((status) => [status, quests.filter((task) => task.status === status).length])),
    [quests],
  );
  const visibleQuests = filter === "overview" ? quests : quests.filter((task) => task.status === filter);

  function refreshSaveState() {
    setParsed(readCurrentGameState());
    setOverrides(readManualOverrides());
  }

  async function refreshWiki() {
    setWiki((current) => ({ ...current, loading: true, error: null }));
    try {
      const result = await fetchWikiQuestData(getWikiTitles());
      const next = writeWikiCache({ ...result, syncedAt: new Date().toISOString() });
      setWiki({ ...next, source: "live", loading: false, error: null });
    } catch (error) {
      setWiki((current) => ({
        ...current,
        source: Object.keys(current.pages || {}).length ? "cache" : "offline",
        loading: false,
        error: error?.message || "攻略同步失败，请稍后重试。",
      }));
    }
  }

  function toggleOverride(taskId, completed) {
    const next = { ...overrides };
    if (completed) next[taskId] = true;
    else delete next[taskId];
    try {
      writeManualOverrides(next);
      setOverrides(next);
    } catch (error) {
      window.alert(error?.message || "人工确认结果保存失败。");
    }
  }

  useEffect(() => {
    const onPassageChange = () => refreshSaveState();
    window.addEventListener("dol-quest-assistant:passagechange", onPassageChange);
    return () => window.removeEventListener("dol-quest-assistant:passagechange", onPassageChange);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    refreshSaveState();
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open || autoRefreshAttempted.current || !shouldRefreshWiki(wiki.syncedAt)) return;
    autoRefreshAttempted.current = true;
    refreshWiki();
  }, [open, wiki.syncedAt]);

  return (
    <>
      <button className={`dqa-launcher ${open ? "dqa-launcher-hidden" : ""}`} type="button" onClick={() => setOpen(true)} aria-label="打开欲都孤儿任务助手">
        <ListChecks />
        <span>任务</span>
        {counts.incomplete ? <b>{counts.incomplete}</b> : null}
      </button>

      {open ? (
        <div className="dqa-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section className="dqa-panel" role="dialog" aria-modal="true" aria-label="欲都孤儿任务助手">
            <header className="dqa-header">
              <div>
                <span className="dqa-brand-mark"><ListChecks /></span>
                <div>
                  <h2>欲都孤儿 <span>任务助手</span></h2>
                  <p>读取当前存档 · 不上传游戏数据</p>
                </div>
              </div>
              <button className="dqa-close" type="button" onClick={() => setOpen(false)} aria-label="关闭任务助手"><X /></button>
            </header>

            {parsed ? (
              <div className="dqa-content">
                <div className="dqa-save-strip">
                  <div><span>当前角色</span><strong>{parsed.profileName}</strong></div>
                  <div><span>游戏版本</span><strong>{parsed.gameVersion}</strong></div>
                  <div><span>当前场景</span><strong>{localizePassage(parsed.passage)}</strong></div>
                  <button type="button" onClick={refreshSaveState}><RefreshCw />重新读取</button>
                </div>

                <SyncStatus wiki={wiki} onRefresh={refreshWiki} />

                <div className="dqa-stats">
                  <StatCard status="incomplete" count={counts.incomplete || 0} />
                  <StatCard status="locked" count={counts.locked || 0} />
                  <StatCard status="uncertain" count={counts.uncertain || 0} />
                  <StatCard status="completed" count={counts.completed || 0} />
                </div>

                <div className="dqa-workspace">
                  <nav className="dqa-filters" aria-label="任务筛选">
                    {FILTERS.map(({ id, label, icon: Icon }) => (
                      <button key={id} type="button" className={filter === id ? "dqa-active" : ""} onClick={() => setFilter(id)}>
                        <Icon /><span>{label}</span><b>{id === "overview" ? quests.length : counts[id] || 0}</b>
                      </button>
                    ))}
                  </nav>
                  <main className="dqa-list">
                    <div className="dqa-list-heading">
                      <div>
                        <span>{FILTERS.find((item) => item.id === filter)?.label}</span>
                        <strong>{visibleQuests.length} 项</strong>
                      </div>
                      <button type="button" onClick={() => downloadMarkdown(parsed, quests, wiki)}><Download />导出清单</button>
                    </div>
                    {visibleQuests.length ? visibleQuests.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        page={wiki.pages?.[task.wikiTitle]}
                        expanded={expanded.has(task.id)}
                        onToggle={() => setExpanded((current) => {
                          const next = new Set(current);
                          if (next.has(task.id)) next.delete(task.id); else next.add(task.id);
                          return next;
                        })}
                        onConfirm={() => toggleOverride(task.id, true)}
                        onUndo={() => toggleOverride(task.id, false)}
                      />
                    )) : <div className="dqa-empty"><CheckCircle2 /><strong>这里暂时没有任务</strong><span>换一个分类看看吧。</span></div>}
                  </main>
                </div>
                <footer className="dqa-footer"><AlertTriangle />任务判定以存档和当前游戏逻辑为准；攻略内容可能落后于游戏版本。</footer>
              </div>
            ) : (
              <div className="dqa-waiting">
                <LoaderCircle className="dqa-spin" />
                <h3>尚未读取存档</h3>
                <p>开始新游戏或读取一个存档后，任务清单才会显示。</p>
                <button type="button" onClick={refreshSaveState}>重新检测</button>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
