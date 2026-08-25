import React from "react";
import { createRoot } from "react-dom/client";
import QuestAssistantMod from "./QuestAssistantMod.jsx";
import styles from "./mod.css?inline";

const HOST_ID = "dol-quest-assistant-mod-root";
const EVENT_NAMESPACE = ".dolQuestAssistant";
const EVENT_BIND_RETRY_MS = 50;

let floatingReactRoot = null;
let journalReactRoot = null;
let currentEmbeddedContainer = null;
let eventBindTimer = null;
let overlayObserver = null;

function stopEventBindRetry() {
  if (eventBindTimer === null) return;
  window.clearTimeout(eventBindTimer);
  eventBindTimer = null;
}

function mountFloating() {
  if (document.getElementById(HOST_ID)) return;
  const host = document.createElement("div");
  host.id = HOST_ID;
  host.setAttribute("data-mod", "DoLQuestAssistant");
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = styles;
  const rootElement = document.createElement("div");
  rootElement.id = "dqa-root";
  shadow.append(style, rootElement);
  document.body.appendChild(host);
  floatingReactRoot = createRoot(rootElement);
  floatingReactRoot.render(<QuestAssistantMod embedded={false} />);
}

export function cleanupJournalTab() {
  if (journalReactRoot) {
    try {
      journalReactRoot.unmount();
    } catch {
      // 忽略卸载异常
    }
    journalReactRoot = null;
    currentEmbeddedContainer = null;
  }
}

function doRenderJournalTab(container) {
  if (!container || !container.isConnected) {
    cleanupJournalTab();
    return;
  }

  const mountPointInContainer = container.shadowRoot?.getElementById("dqa-embedded-root");

  if (
    journalReactRoot &&
    currentEmbeddedContainer === container &&
    mountPointInContainer &&
    mountPointInContainer.isConnected
  ) {
    journalReactRoot.render(<QuestAssistantMod embedded={true} />);
    return;
  }

  cleanupJournalTab();
  currentEmbeddedContainer = container;

  let shadow = container.shadowRoot;
  if (!shadow) {
    try {
      shadow = container.attachShadow({ mode: "open" });
    } catch {
      shadow = container;
    }
  }

  let mountPoint = shadow.getElementById
    ? shadow.getElementById("dqa-embedded-root")
    : shadow.querySelector("#dqa-embedded-root");

  if (!mountPoint) {
    const style = document.createElement("style");
    style.textContent = styles;
    mountPoint = document.createElement("div");
    mountPoint.id = "dqa-embedded-root";
    shadow.append(style, mountPoint);
  }

  journalReactRoot = createRoot(mountPoint);
  journalReactRoot.render(<QuestAssistantMod embedded={true} />);
}

export function renderJournalTab() {
  const container = document.getElementById("dol-quest-assistant-tab-container")
    || document.getElementById("customOverlayContent");

  if (!container) {
    window.requestAnimationFrame(() => {
      const retryContainer = document.getElementById("dol-quest-assistant-tab-container")
        || document.getElementById("customOverlayContent");
      if (retryContainer) doRenderJournalTab(retryContainer);
    });
    return;
  }

  doRenderJournalTab(container);
}

function isJournalOverlay() {
  const overlay = document.getElementById("customOverlay");
  if (!overlay) return false;
  const dataOverlay = overlay.getAttribute("data-overlay");
  if (dataOverlay === "journal" || dataOverlay === "journalNotes" || dataOverlay === "journalQuests") {
    return true;
  }
  const tabs = overlay.querySelector("#overlayTabs");
  if (!tabs) return false;
  const text = tabs.textContent || "";
  return text.includes("Journal") || text.includes("日志") || text.includes("Notes") || text.includes("笔记");
}

function ensureJournalTabButton() {
  if (!isJournalOverlay()) return;
  const tabs = document.getElementById("overlayTabs");
  if (!tabs) return;

  // 为原生其它 Tab（日志、笔记等）绑定点击清理事件
  const otherButtons = tabs.querySelectorAll("button:not([data-dqa-tab='true'])");
  otherButtons.forEach((btn) => {
    const txt = btn.textContent?.trim() || "";
    if (txt !== "任务" && txt !== "Quests") {
      if (!btn.hasAttribute("data-dqa-cleanup-bound")) {
        btn.setAttribute("data-dqa-cleanup-bound", "true");
        btn.addEventListener("click", () => {
          cleanupJournalTab();
        });
      }
    }
  });

  const existingButton = Array.from(tabs.querySelectorAll("button")).find((btn) => {
    const txt = btn.textContent?.trim() || "";
    return txt === "任务" || txt === "Quests" || btn.hasAttribute("data-dqa-tab");
  });

  if (existingButton) {
    if (!existingButton.hasAttribute("data-dqa-bound")) {
      existingButton.setAttribute("data-dqa-bound", "true");
      existingButton.addEventListener("click", () => {
        window.setTimeout(() => renderJournalTab(), 0);
      });
    }
    return;
  }

  const tabButton = document.createElement("button");
  tabButton.setAttribute("type", "button");
  tabButton.setAttribute("data-dqa-tab", "true");
  tabButton.setAttribute("data-dqa-bound", "true");
  tabButton.className = "macro-button";
  tabButton.textContent = "任务";

  tabButton.addEventListener("click", () => {
    const allButtons = tabs.querySelectorAll("button");
    allButtons.forEach((btn) => btn.classList.remove("tab-selected"));
    tabButton.classList.add("tab-selected");

    const content = document.getElementById("customOverlayContent");
    if (content) {
      content.innerHTML = '<div id="dol-quest-assistant-tab-container"></div>';
      renderJournalTab();
    }
  });

  tabs.appendChild(tabButton);
}

function setupOverlayObserver() {
  if (overlayObserver) return;
  const target = document.body;
  if (!target) return;

  overlayObserver = new MutationObserver(() => {
    ensureJournalTabButton();
  });
  overlayObserver.observe(target, { childList: true, subtree: true });
}

function attach() {
  stopEventBindRetry();
  if (document.body) {
    mountFloating();
    setupOverlayObserver();
    ensureJournalTabButton();
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      mountFloating();
      setupOverlayObserver();
      ensureJournalTabButton();
    }, { once: true });
  }
}

function bindGameEvents() {
  const jq = window.jQuery || window.$;
  if (typeof jq !== "function") return false;
  jq(document)
    .off(EVENT_NAMESPACE)
    .on(`:passageend${EVENT_NAMESPACE}`, () => {
      attach();
      window.dispatchEvent(new CustomEvent("dol-quest-assistant:passagechange"));
      ensureJournalTabButton();
    })
    .on(`:oncloseoverlay${EVENT_NAMESPACE}`, () => {
      cleanupJournalTab();
    });
  return true;
}

function bindGameEventsWhenAvailable() {
  if (bindGameEvents()) {
    eventBindTimer = null;
    return;
  }
  eventBindTimer = window.setTimeout(bindGameEventsWhenAvailable, EVENT_BIND_RETRY_MS);
}

function detach() {
  stopEventBindRetry();
  if (overlayObserver) {
    overlayObserver.disconnect();
    overlayObserver = null;
  }
  const jq = window.jQuery || window.$;
  if (typeof jq === "function") jq(document).off(EVENT_NAMESPACE);
  floatingReactRoot?.unmount();
  floatingReactRoot = null;
  cleanupJournalTab();
  document.getElementById(HOST_ID)?.remove();
}

window.dolQuestAssistant = {
  attach,
  detach,
  renderJournalTab,
  cleanupJournalTab,
  refresh() {
    window.dispatchEvent(new CustomEvent("dol-quest-assistant:passagechange"));
  },
};

bindGameEventsWhenAvailable();
