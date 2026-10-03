import assert from "node:assert/strict";
import test from "node:test";
import { analyzeQuests, getWikiTitles } from "../src/lib/quest-analyzer.js";
import { localizeAveryFate } from "../src/lib/localization.js";

test("攻略同步覆盖所有可见条目，包括承诺和 NPC 放逐分支", () => {
  const titles = getWikiTitles();
  const all = analyzeQuests({ variables: {} });
  assert.equal(all.length, 62);
  assert.equal(titles.length, new Set(titles).size);
  assert.deepEqual(all.filter((item) => !titles.includes(item.wikiTitle)), []);
  for (const title of ["承诺仪式", "放逐NPC", "放逐艾弗里", "放逐凯拉尔", "放逐惠特尼"]) {
    assert.ok(titles.includes(title), title);
  }
});

test("人工完成确认清除旧的待办与未确认说明，原任务变量保持不变", () => {
  const variables = { spear_vessel: "held" };
  const before = structuredClone(variables);
  const unconfirmed = analyzeQuests({ variables }).find((item) => item.id === "temple-spear");
  assert.ok(unconfirmed.next.length > 0);
  const confirmed = analyzeQuests({ variables }, { "temple-spear": true })
    .find((item) => item.id === "temple-spear");
  assert.equal(confirmed.status, "completed");
  assert.equal(confirmed.manualConfirmed, true);
  assert.deepEqual(confirmed.next, []);
  assert.match(confirmed.note, /依据你的确认/);
  assert.ok(confirmed.evidence.includes("人工确认：已完成"));
  assert.deepEqual(variables, before);
});

test("艾弗里高塔结局名称与普通放逐状态区分", () => {
  assert.equal(localizeAveryFate("kicked"), "被踢下高塔身亡");
  assert.equal(localizeAveryFate("ascended"), "已飞升");
  assert.equal(localizeAveryFate("fallen"), "从高塔坠落（未救援）");
  assert.equal(localizeAveryFate("saved"), "已获救");
  assert.equal(localizeAveryFate("unknown-fate"), "未识别结局");
});
