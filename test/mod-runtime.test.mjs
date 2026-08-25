import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("ModLoader 轻量启动器可以被 preload 返回表达式包装", () => {
  const content = readFileSync(new URL("../mod/runtime/preload.js", import.meta.url), "utf8");
  assert.doesNotThrow(() => new Function(`return ${content}`));
});

test("preload 阶段只检查主程序，不创建任务入口", () => {
  const content = readFileSync(new URL("../mod/runtime/preload.js", import.meta.url), "utf8");
  let attachCalls = 0;
  const scope = {
    dolQuestAssistant: { attach() { attachCalls += 1; } },
    V: { saveName: "加载中的临时状态" },
    State: { variables: {} },
  };
  new Function("window", `return ${content}`)(scope);
  assert.equal(attachCalls, 0);
});

test("boot.json 使用提前注入主程序和轻量 preload，并注册了 overlay-replace 补丁", () => {
  const boot = JSON.parse(readFileSync(new URL("../mod/boot.json", import.meta.url), "utf8"));
  assert.deepEqual(boot.scriptFileList_inject_early, ["dist/DoLQuestAssistant.js"]);
  assert.deepEqual(boot.scriptFileList_preload, ["dist/preload/preload.js"]);
  assert.deepEqual(boot.replacePatchList, ["patches/overlay-replace.json"]);

  const patch = JSON.parse(readFileSync(new URL("../mod/patches/overlay-replace.json", import.meta.url), "utf8"));
  assert.equal(patch.twee.length, 2);
  assert.equal(patch.twee[0].passageName, "overlayReplace");
});

test("Mod 主程序等待首个场景完成，不在 storyready 或 ModLoader 加载阶段挂载", () => {
  const content = readFileSync(new URL("../mod/src/entry.jsx", import.meta.url), "utf8");
  assert.match(content, /\.on\(`:passageend\$\{EVENT_NAMESPACE\}`, \(\) => \{\s+attach\(\);/);
  assert.match(content, /bindGameEventsWhenAvailable\(\);\s*$/);
  assert.doesNotMatch(content, /:storyready/);
  assert.doesNotMatch(content, /gameStateReady/);
  assert.doesNotMatch(content, /3_000/);
});

test("每次游戏会话首次打开任务面板时自动刷新一次攻略", () => {
  const content = readFileSync(new URL("../mod/src/QuestAssistantMod.jsx", import.meta.url), "utf8");
  assert.match(content, /function openPanel\(\) \{\s+setOpen\(true\);\s+if \(autoRefreshAttempted\.current\) return;\s+autoRefreshAttempted\.current = true;\s+void refreshWiki\(\);\s+\}/);
  assert.match(content, /onClick=\{openPanel\}/);
  assert.doesNotMatch(content, /shouldRefreshWiki/);
});
