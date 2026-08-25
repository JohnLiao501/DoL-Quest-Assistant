import React from "react";
import { createRoot } from "react-dom/client";
import QuestAssistantMod from "./QuestAssistantMod.jsx";
import styles from "./mod.css?inline";

const HOST_ID = "dol-quest-assistant-mod-root";
const EVENT_NAMESPACE = ".dolQuestAssistant";
const EVENT_BIND_RETRY_MS = 50;
let reactRoot = null;
let eventBindTimer = null;

function stopEventBindRetry() {
  if (eventBindTimer === null) return;
  window.clearTimeout(eventBindTimer);
  eventBindTimer = null;
}

function mount() {
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
  reactRoot = createRoot(rootElement);
  reactRoot.render(<QuestAssistantMod />);
}

function attach() {
  stopEventBindRetry();
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });
}

function bindGameEvents() {
  const jq = window.jQuery || window.$;
  if (typeof jq !== "function") return false;
  jq(document)
    .off(EVENT_NAMESPACE)
    .on(`:passageend${EVENT_NAMESPACE}`, () => {
      attach();
      window.dispatchEvent(new CustomEvent("dol-quest-assistant:passagechange"));
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
  const jq = window.jQuery || window.$;
  if (typeof jq === "function") jq(document).off(EVENT_NAMESPACE);
  reactRoot?.unmount();
  reactRoot = null;
  document.getElementById(HOST_ID)?.remove();
}

window.dolQuestAssistant = { attach, detach, refresh() {
  window.dispatchEvent(new CustomEvent("dol-quest-assistant:passagechange"));
} };

bindGameEventsWhenAvailable();
