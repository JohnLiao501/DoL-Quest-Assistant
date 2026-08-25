import test from "node:test";
import assert from "node:assert/strict";
import {
  localizeAveryFate,
  localizeEscapeRoute,
  localizeKnownTerms,
  localizePassage,
  localizePlayRole,
  localizeTempleRank,
  localizeWikiTitle,
  localizeWraithState,
} from "../src/lib/localization.js";

test("存档中的常见英文枚举值会显示为中文", () => {
  assert.equal(localizePassage("Forest"), "森林");
  assert.equal(localizeTempleRank("monk"), "修士");
  assert.equal(localizeWraithState("despair"), "绝望");
  assert.equal(localizeEscapeRoute("night"), "夜间逃脱");
  assert.equal(localizeAveryFate("saved"), "已获救");
  assert.equal(localizePlayRole("Cass"), "卡斯");
});

test("中文攻略摘要中的已知英文人名会按 Wiki 译名替换", () => {
  assert.equal(
    localizeKnownTerms("Sydney 与 Jordan 谈论 Alex 和 Quinn。"),
    "悉尼 与 约旦 谈论 艾利克斯 和 奎恩。",
  );
  assert.equal(localizeWikiTitle("Tenyclus"), "街机游戏最终事件");
  assert.equal(
    localizeKnownTerms("（Cafe Campaign）咖啡馆任务。本页取自enwiki，版本0.4.3.3-chs-alpha2.5.0"),
    "咖啡馆任务。本页译自英文攻略站，内容对应较早的汉化版本。",
  );
});
