import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("ModLoader 轻量启动器可以被 preload 返回表达式包装", () => {
  const content = readFileSync(new URL("../mod/runtime/preload.js", import.meta.url), "utf8");
  assert.doesNotThrow(() => new Function(`return ${content}`));
});

test("boot.json 使用提前注入主程序和轻量 preload", () => {
  const boot = JSON.parse(readFileSync(new URL("../mod/boot.json", import.meta.url), "utf8"));
  assert.deepEqual(boot.scriptFileList_inject_early, ["dist/DoLQuestAssistant.js"]);
  assert.deepEqual(boot.scriptFileList_preload, ["dist/preload/preload.js"]);
});
