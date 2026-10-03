import assert from "node:assert/strict";
import test from "node:test";
import { analyzeQuests } from "../src/lib/quest-analyzer.js";

const analyze = (id, variables) => analyzeQuests({ variables }).find((entry) => entry.id === id);

test("农场早期事件允许半块田地或工作时长触发，最终阶段仍需到 12", () => {
  const visitorByClearing = analyze("farm", { farm_stage: 2, farm: { clearing: 50 }, farm_shift: 0 });
  assert.equal(visitorByClearing.status, "incomplete");
  assert.match(visitorByClearing.next[0], /触发访客/);
  assert.doesNotMatch(visitorByClearing.next[0], /降到 0/);

  const visitorByShift = analyze("farm", { farm_stage: 2, farm: { clearing: 90 }, farm_shift: 360 });
  assert.match(visitorByShift.next[0], /触发访客/);
  const waitingVisitor = analyze("farm", { farm_stage: 2, farm: { clearing: 90 }, farm_shift: 120 });
  assert.match(waitingVisitor.next[0], /降到 50.*360 分钟/);

  for (const variables of [
    { farm_stage: 6, farm: { clearing: 50 }, farm_countdown: 3 },
    { farm_stage: 6, farm: { clearing: 90 }, farm_countdown: 0 },
  ]) {
    assert.match(analyze("farm", variables).next[0], /触发下一阶段/);
  }
  const countdownMissing = analyze("farm", { farm_stage: 6, farm: { clearing: 90 } });
  assert.match(countdownMissing.next[0], /降到 50.*等待/);
  assert.match(analyze("farm", { farm_stage: 6, farm: { clearing: null }, farm_countdown: null }).next[0], /降到 50.*等待/);
  assert.match(analyze("farm", { farm_stage: 3, farm: { clearing: 50 } }).next[0], /降到 0/);
  assert.equal(analyze("farm", { farm_stage: 11, farm: { clearing: 0 } }).status, "incomplete");
  assert.equal(analyze("farm", { farm_stage: 12 }).status, "completed");
  assert.equal(analyze("farm", { farm_stage: Infinity }).status, "uncertain");
});

test("已经向警方交证据仍未完成礼顿勒索，也不再要求重复报警", () => {
  const copied = analyze("leighton-blackmail", { headdrive: 1, headpolice: 0 });
  assert.equal(copied.status, "incomplete");
  assert.match(copied.next.join(" "), /警方/);

  const reported = analyze("leighton-blackmail", { headdrive: 1, headpolice: 1 });
  assert.equal(reported.status, "incomplete");
  assert.match(reported.current, /已经交给警方/);
  assert.doesNotMatch(reported.next.join(" "), /警方|报警/);
  assert.match(reported.next.join(" "), /勒索/);
  assert.equal(analyze("leighton-blackmail", { headdrive: 1, headpolice: 1, headblackmailed: 1 }).status, "completed");
});

test("分裂只接受当前存档成就或真实最终幻象标记", () => {
  const accountOnly = analyze("schism", { feats: { currentSave: {}, allSaves: { Schism: "2026-01-01" } } });
  assert.notEqual(accountOnly.status, "completed");
  assert.equal(analyze("schism", { feats: { currentSave: { Schism: "2026-01-01" } } }).status, "completed");
  assert.equal(analyze("schism", { feats: { currentSave: ["Schism"] } }).status, "completed");
  assert.equal(analyze("schism", { feats: { currentSave: {}, allSaves: [] }, wraithPrison: { vision: true } }).status, "completed");
  const pending = analyze("schism", { wraith: { state: "dormant" }, wraithPrison: { timePassed: 140, vision: false } });
  assert.equal(pending.status, "incomplete");
  assert.match(pending.next.join(" "), /纠缠或绝望.*40%.*140 分钟/);
  assert.notEqual(analyze("schism", { wraithPrison: { vision: "false" } }).status, "completed");
});

test("已有圣矛或已知遗失结局优先于接取朝圣任务的身份门槛", () => {
  const heldBeforeMission = analyze("temple-spear", { spear_vessel: "held" });
  assert.equal(heldBeforeMission.status, "incomplete");
  assert.match(heldBeforeMission.next.join(" "), /交付圣矛/);
  assert.doesNotMatch(heldBeforeMission.next.join(" "), /晋升|恩典|取回/);
  assert.match(analyze("temple-spear", { temple_spear_mission: 1, spear_vessel: "held" }).next.join(" "), /交付圣矛/);
  for (const [vessel, expected] of [["sea", /海中遗失/], ["Zephyr", /被海盗夺走/]]) {
    const lost = analyze("temple-spear", { temple_spear_mission: 1, spear_vessel: vessel });
    assert.equal(lost.status, "incomplete");
    assert.match(lost.next.join(" "), expected);
    assert.doesNotMatch(lost.next.join(" "), /调查|取回/);
    const reported = analyze("temple-spear", { temple_spear_mission: 2, spear_vessel: vessel });
    assert.equal(reported.status, "completed");
    assert.match(reported.current, /汇报/);
    assert.doesNotMatch(reported.current, /送回|交付成功/);
  }
  const eligible = analyze("temple-spear", { temple_rank: "monk", grace: 100 });
  assert.equal(eligible.status, "incomplete");
  assert.match(eligible.next.join(" "), /接受/);
});

test("本学年学校项目不被上一学年获奖记录覆盖", () => {
  for (const state of ["none", "ongoing"]) {
    const annual = analyze("school-projects", {
      scienceprojectwon: 1, scienceproject: state,
      mathsprojectwon: 1, mathsproject: state, englishPlay: "done",
    });
    assert.equal(annual.status, "incomplete");
    assert.equal(annual.progress.value, 1);
    assert.ok(annual.evidence.some((line) => /曾获得科学.*不代表本年/.test(line)));
    assert.ok(annual.evidence.some((line) => /曾获得数学.*不代表本年/.test(line)));
  }
  const unknown = analyze("school-projects", { scienceprojectwon: 1, mathsprojectwon: 1 });
  assert.equal(unknown.status, "uncertain");
  assert.equal(unknown.progress.value, 0);
});

test("数学比赛入场写 done 仍须到结尾，超期英语话剧等待下一年", () => {
  const start = { scienceproject: "done", mathsproject: "done", englishPlay: "done", mathsprojectdays: 0 };
  const entered = analyze("school-projects", start);
  assert.equal(entered.status, "incomplete");
  assert.equal(entered.progress.value, 2);
  assert.ok(entered.evidence.some((line) => /数学.*已进入比赛，尚未结束/.test(line)));
  delete start.mathsprojectdays; // mathsprojectfinish 清除此字段。
  assert.equal(analyze("school-projects", start).status, "completed");

  const expired = analyze("school-projects", { scienceproject: "done", mathsproject: "done", englishPlay: "missed" });
  assert.equal(expired.status, "completed");
  assert.match(expired.current, /本年已错过/);
  assert.match(expired.next.join(" "), /下一学年/);
  assert.doesNotMatch(expired.next.join(" "), /继续推进英语/);
  assert.match(expired.note, /不保证实际参加或获奖/);
});

test("初始化走私地点或历史抢夺记录不会泄露本轮线索", () => {
  for (const variables of [
    { smuggler_location: "sewer", smuggler_timer: 0 },
    { smuggler_location: "forest", smuggler_timer: 6, smuggler_stolen_stat: 1 },
  ]) {
    const hidden = analyze("smugglers", variables);
    assert.equal(hidden.status, "locked");
    assert.match(hidden.current, /尚未获知本轮/);
    assert.match(hidden.next.join(" "), /脱衣舞俱乐部.*调酒.*偷听/);
    assert.doesNotMatch(hidden.current, /旧下水道|森林|6 天/);
  }
});

test("走私情报按四条真实路线和当前周期给出指引", () => {
  for (const [location, label] of [["forest", "森林"], ["sewer", "旧下水道"], ["beach", "沙滩附近的礁石"], ["bus", "公交站"]]) {
    const tonight = analyze("smugglers", { smuggler_known: 1, smuggler_location: location, smuggler_timer: 0 });
    assert.equal(tonight.status, "incomplete");
    assert.ok(tonight.next.join(" ").includes(label));
    assert.match(tonight.next.join(" "), /今晚午夜前/);
    assert.doesNotMatch(tonight.next.join(" "), /秘密据点|老水手/);
    const future = analyze("smugglers", { smuggler_known: 1, smuggler_location: location, smuggler_timer: 3 });
    assert.match(future.current, /3 天后/);
    assert.match(future.next.join(" "), /等待 3 天/);
  }
  const closed = analyze("smugglers", { smuggler_known: 1, smuggler_location: "beach", smuggler_timer: -1 });
  assert.equal(closed.status, "recurring");
  assert.match(closed.current, /本轮.*已经结束/);
  assert.doesNotMatch(closed.next.join(" "), /今晚|潜入/);
  assert.equal(analyze("smugglers", { smuggler_known: 1, smuggler_location: "unknown", smuggler_timer: 0 }).status, "uncertain");
  assert.equal(analyze("smugglers", { smuggler_known: 1, smuggler_location: "forest" }).status, "uncertain");
  assert.equal(analyze("smugglers", { smuggler_known: 1, smuggler_location: "forest", smuggler_timer: null }).status, "uncertain");
});

test("神殿誓言以真实誓言标记判定，装置不能证明当前遵守誓言", () => {
  const valid = analyze("chastity-vow", { temple_rank: "initiate", player: { virginity: { temple: true } }, worn: { genitals: { name: "naked" } } });
  assert.equal(valid.status, "completed");
  assert.match(valid.current, /当前仍在遵守/);
  for (const equipment of [
    { name: "chastity belt", origin: "temple" },
    { name: "chastity parasite" },
    { name: "steel chastity belt", origin: "external" },
  ]) {
    const broken = analyze("chastity-vow", { temple_rank: "monk", player: { virginity: { temple: false } }, worn: { genitals: equipment } });
    assert.equal(broken.status, "incomplete");
    assert.match(broken.next.join(" "), /忏悔/);
  }
  assert.equal(analyze("chastity-vow", { temple_rank: "priest", worn: { genitals: { name: "chastity belt" } } }).status, "uncertain");
  assert.equal(analyze("chastity-vow", { temple_rank: "prospective", player: { virginity: { temple: true } } }).status, "locked");
  assert.equal(analyze("chastity-vow", { temple_rank: "sister", player: { virginity: { temple: true } } }).status, "locked");
});

test("保留兴奋剂与码头历史不确定、鱼需交付、舞会结尾和每周演出语义", () => {
  assert.equal(analyze("stimulant-abduction", { mathsstimcaught: 1 }).status, "uncertain");
  assert.equal(analyze("docks-infiltration", { skul_dock: {} }).status, "uncertain");
  assert.equal(analyze("fishing-request", { fishing: {}, daily: { fishing: { baitShopRequest: "ready", baitShopRequestFish: "cod" } } }).status, "incomplete");
  assert.equal(analyze("wren-heist", { wrenHeist: true, wrenHeistDance: { attended: true } }).status, "incomplete");
  assert.equal(analyze("wren-heist", { wrenSeen: ["heist"] }).status, "completed");
  const weekly = analyze("charlie-jobs", { weekly: { danceJob: "done" } });
  assert.equal(weekly.status, "completed");
  assert.match(weekly.note, /不表示.*永久完成或演出成功/);
});
