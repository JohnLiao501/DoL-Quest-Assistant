import assert from "node:assert/strict";
import test from "node:test";
import { analyzeAsylumExploration } from "../src/lib/asylum-quests.js";

const completedFeats = ["Record Keeper", "Bramble Tamer", "Eyes in the Night", "Mirror Madness"];

test("精神病院禁区没有当前探索记录时保持锁定", () => {
  const result = analyzeAsylumExploration({});
  assert.equal(result.status, "locked");
  assert.equal(result.progress.value, 0);
  assert.equal(result.evidence.length, 4);
  assert.match(result.next[0], /自由活动.*穿好衣服/);
});

test("禁区阶段到达末尾仍须确认最终事件成就", () => {
  const result = analyzeAsylumExploration({
    asylum_depths: 1,
    asylum_office: 5,
    asylum_garden: 5,
    asylum_tunnels: 6,
    asylum_mirror: 5,
  });
  assert.equal(result.status, "uncertain");
  assert.equal(result.progress.value, 0);
  assert.equal(result.next.length, 4);
  assert.ok(result.next.every((next) => next.includes("尚未记录本存档的完成成就")));
  assert.ok(result.evidence.every((evidence) => evidence.includes("完成待确认")));
  assert.match(result.note, /禁用成就.*人工确认/);
});

test("一条路线阶段已到末尾且无成就时保守标记待确认", () => {
  const result = analyzeAsylumExploration({ asylum_office: 5, feats: { locked: true } });
  assert.equal(result.status, "uncertain");
  assert.equal(result.progress.value, 0);
  assert.match(result.current, /旧办公室：阶段 5\/5，完成待确认/);
  assert.match(result.current, /隐蔽花园：待探索/);
});

test("其他存档的禁区成就不表示当前存档完成", () => {
  const result = analyzeAsylumExploration({ feats: { currentSave: [], allSaves: completedFeats } });
  assert.equal(result.status, "locked");
  assert.equal(result.progress.value, 0);
});

test("本存档四项禁区成就全部取得才完成聚合任务", () => {
  const result = analyzeAsylumExploration({ feats: { currentSave: completedFeats } });
  assert.equal(result.status, "completed");
  assert.equal(result.progress.value, 4);
  assert.equal(result.progress.max, 4);
  assert.deepEqual(result.next, []);
  assert.ok(result.evidence.every((evidence) => evidence.includes("本存档已记录完成成就")));
});

test("字典式当前成就记录只完成对应路线，隧道囚室提示拉杆", () => {
  const result = analyzeAsylumExploration({
    asylum_tunnels: 5,
    feats: { currentSave: { "Record Keeper": true }, allSaves: completedFeats },
  });
  assert.equal(result.status, "incomplete");
  assert.equal(result.progress.value, 1);
  assert.match(result.current, /旧办公室：已完成/);
  assert.ok(result.next.some((next) => next.includes("拉下拉杆")));
});

test("非数值和非有限阶段不会伪造探索进度", () => {
  const result = analyzeAsylumExploration({ asylum_office: "unknown", asylum_mirror: Infinity });
  assert.equal(result.status, "locked");
  assert.equal(result.progress.value, 0);
});
