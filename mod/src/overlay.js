const JOURNAL_OVERLAYS = ["journal", "journalNotes", "journalQuests"];
const JOURNAL_TABS = ["Journal", "日志", "Notes", "笔记"];

export function isJournalOverlay(overlay) {
  if (!overlay) return false;
  const type = overlay.getAttribute("data-overlay");
  if (type) return JOURNAL_OVERLAYS.includes(type);
  return Array.from(overlay.querySelectorAll("#overlayTabs button"))
    .some((button) => JOURNAL_TABS.includes(button.textContent?.trim() || ""));
}
