import assert from "node:assert/strict";
import test from "node:test";
import { analyzeQuests } from "../src/lib/quest-analyzer.js";

const analyze = (id, variables) => analyzeQuests({ variables }).find((item) => item.id === id);
const currentFeat = (name) => ({ currentSave: { [name]: "2026-10-03T00:00:00Z" } });

test("咖啡馆开幕第一页不能替代开幕结尾", () => {
  const opening = analyze("cafe", { chef_state: 9, bun_value: 7500 });
  assert.equal(opening.status, "incomplete");
  assert.match(opening.current, /开幕阶段/);
  assert.equal(analyze("cafe", { chef_state: 9, bun_value: 10000 }).status, "completed");
  assert.equal(analyze("cafe", { chef_state: 0, bun_value: 0 }).status, "locked");
});

test("罗宾失踪字符串显示实际去向，支付记录只确认本轮", () => {
  const missing = analyze("robin-debt", { robinpaid: 1, robinmissing: "docks" });
  assert.equal(missing.status, "incomplete");
  assert.match(missing.evidence.join(" "), /当前失踪：商业码头/);
  const paid = analyze("robin-debt", { robinpaid: 1, robinmissing: 0 });
  assert.equal(paid.status, "completed");
  assert.match(paid.current, /本轮/);
});

test("飞行训练开始与当前角色飞行成功分别判定", () => {
  assert.equal(analyze("flight", { birdFly: 1, birdGlide: 1 }).status, "uncertain");
  assert.equal(analyze("flight", { feats: { allSaves: { "Catch the Wind": true } } }).status, "incomplete");
  assert.equal(analyze("flight", { feats: currentFeat("Catch the Wind") }).status, "completed");
});

test("神殿晋升只接受本档身份或成就，并保留历史身份边界", () => {
  assert.equal(analyze("temple-promotion", { feats: { allSaves: { "Defy the Night": true } } }).status, "incomplete");
  assert.equal(analyze("temple-promotion", { temple_rank: "monk" }).status, "completed");
  const historical = analyze("temple-promotion", { feats: currentFeat("Defy the Night") });
  assert.equal(historical.status, "completed");
  assert.match(historical.current, /当前神殿身份可能已改变/);
});

test("多伦初访不用可选共浴询问作为强制终点", () => {
  const visit = analyze("doren-concern", { dorenhonest: 1, dorenintro: 1, dorenSeen: [] });
  assert.equal(visit.status, "uncertain");
  assert.match(visit.current, /已开始拜访/);
  assert.match(visit.next.join(" "), /可选对话/);
  assert.equal(analyze("doren-concern", { dorenhonest: 1 }).status, "incomplete");
  assert.equal(analyze("doren-concern", {}).status, "locked");
});

test("礼顿拍摄冷却零值和多日间隔均不代表解除勒索", () => {
  for (const schoolfameblackmail of [0, 2]) {
    const photos = analyze("leighton-player-blackmail", { schoolfameblackmail, schoolfameboard: 1 });
    assert.equal(photos.status, "recurring");
    assert.doesNotMatch(photos.current, /已结束|已经结束/);
  }
  assert.equal(analyze("leighton-player-blackmail", {}).status, "locked");
  assert.equal(analyze("leighton-player-blackmail", { headphotoshoot: 1 }).status, "completed");
  for (const reward of [{ headmoney: 1 }, { headnodetention: 1 }]) {
    const stillForced = analyze("leighton-player-blackmail", { headblackmailed: 1, schoolfameblackmail: 7, ...reward });
    assert.equal(stillForced.status, "recurring");
    assert.doesNotMatch(stillForced.current, /已出现礼顿停止拍摄/);
  }
  const voluntary = analyze("leighton-player-blackmail", { headphotoshoot: 1, schoolfameconsensual: 1 });
  assert.equal(voluntary.status, "completed");
  assert.match(voluntary.current, /拍摄仍可继续/);
  assert.doesNotMatch(voluntary.current, /停止拍摄/);
  assert.ok(voluntary.evidence.includes("停止拍摄记录：否"));
});

test("三次检查回放全部解锁仍不能确认所有结尾", () => {
  const inspections = analyze("leighton-inspections", {
    schoolevent: 3,
    scenePassages: ["Penis School Inspection", "Pussy School Inspection", "Breast School Inspection"],
  });
  assert.equal(inspections.status, "uncertain");
  assert.match(inspections.current, /已解锁 3\/3/);
  assert.doesNotMatch(inspections.evidence.join(" "), /已看过/);
});

test("凯拉尔睡眠入口和斯德哥尔摩回放不会互相冒充完成", () => {
  const sleep = analyze("kylar-abduction", { kylar_sleep_abduction: 1 });
  assert.equal(sleep.status, "uncertain");
  assert.match(sleep.current, /睡眠绑架已开始/);
  const stockholm = analyze("kylar-abduction", { scenePassages: ["KylarAbduction"] });
  assert.equal(stockholm.status, "uncertain");
  assert.match(stockholm.current, /不是睡眠绑架完成/);
});

test("凯拉尔结束记录接受原生成功理由，排除自动补写 unknown", () => {
  for (const reasonEnd of ["kylarAbductionReleased", "kylarAbductionRescued", "kylarAbductionLeave", "kylarStockholmRefused", "kylarStockholm"]) {
    assert.equal(analyze("kylar-abduction", { badEndStats: [{ source: "Kylar Abduction", trackedEnd: 500, reasonEnd }] }).status, "completed", reasonEnd);
  }
  for (const record of [
    { source: "Kylar Abduction", trackedEnd: 500, reasonEnd: "unknown" },
    { source: "Prison", trackedEnd: 500, reasonEnd: "kylarAbductionReleased" },
    { source: "Kylar Abduction", trackedEnd: "500", reasonEnd: "kylarAbductionReleased" },
    { source: "Kylar Abduction", trackedEnd: Infinity, reasonEnd: "kylarAbductionReleased" },
    { source: "Kylar Abduction", reasonEnd: "kylarAbductionReleased" },
  ]) assert.equal(analyze("kylar-abduction", { badEndStats: [record] }).status, "uncertain");
});

test("科学展直接获胜字段在禁用成就时仍有效", () => {
  assert.equal(analyze("science-fair", { scienceproject: "won", cheatsEnabled: true }).status, "completed");
  assert.equal(analyze("science-fair", { scienceprojectwon: 1 }).status, "completed");
  assert.equal(analyze("science-fair", { feats: currentFeat("Science Fair Winner") }).status, "completed");
  assert.equal(analyze("science-fair", { feats: { allSaves: { "Science Fair Winner": true } } }).status, "incomplete");
});

test("错过话剧不能被保留的报名角色改为已出演", () => {
  const missed = analyze("english-play", { englishPlay: "missed", englishPlayRolePlayed: "Cass" });
  assert.equal(missed.status, "locked");
  assert.match(missed.next.join(" "), /下一学年/);
  assert.equal(analyze("english-play", { englishPlay: "done", englishPlayRolePlayed: "Cass" }).status, "completed");
  assert.equal(analyze("english-play", { englishPlay: "none", englishPlayRolePlayed: "Cass" }).status, "uncertain");
});

test("地下农场白天逃跑中途未完成，援救离开后不依赖已清除的 escape", () => {
  for (const escape of ["hole", "river"]) assert.equal(analyze("moor-abduction", { livestock: { intro: true, escape } }).status, "incomplete");
  for (const reasonEnd of ["uFarmEscapedNightRiver", "uFarmEscapedNightRiverFrozen", "uFarmEscapedNightHole", "uFarmEscapedFamiliar", "uFarmEscapedCentaurThank", "uFarmEscapedCentaurKiss", "uFarmEscapedHorse"]) {
    assert.equal(analyze("moor-abduction", { livestock: { intro: true }, badEndStats: [{ source: "Underground Farm", trackedEnd: 500, reasonEnd }] }).status, "completed", reasonEnd);
  }
  assert.equal(analyze("moor-abduction", { badEndStats: [{ source: "Underground Farm", trackedEnd: 500, reasonEnd: "unknown" }] }).status, "uncertain");
  assert.equal(analyze("moor-abduction", { badEndStats: [{ source: "Asylum", trackedEnd: 500, reasonEnd: "uFarmEscapedHorse" }] }).status, "uncertain");
});

test("街机累计七次只到达最终链门槛，服装自动解锁也不能证明结尾", () => {
  const ongoing = analyze("tenyclus", { tenyclusPlayCount: 4 });
  assert.match(ongoing.current, /累计/);
  assert.doesNotMatch(ongoing.next.join(" "), /连续七天/);
  const final = analyze("tenyclus", { tenyclusPlayCount: 7, specialClothes: [{ name: "futuristic bodysuit", unlocked: 3 }] });
  assert.equal(final.status, "uncertain");
  assert.match(final.current, /最终事件链已触发/);
});

test("夜魔第二遭遇入口只证明阶段触发", () => {
  assert.equal(analyze("night-monster", { nightMonsterIntro: 2 }).status, "uncertain");
  assert.equal(analyze("night-monster", { nightMonsterIntro: 1 }).status, "incomplete");
});

test("高塔施工满进度等待开幕，只有本档结局与成就确认结果阶段", () => {
  const built = analyze("avery-tower", { avery_tower: { progress: 100, stage: 2 } });
  assert.equal(built.status, "incomplete");
  assert.match(built.current, /施工已经完成.*开幕邀请/);
  assert.equal(analyze("avery-tower", { feats: { allSaves: { "Pride Cometh": true } } }).status, "incomplete");
  for (const avery_fate of ["ascended", "saved", "fallen", "kicked"]) assert.equal(analyze("avery-tower", { avery_fate }).status, "completed");
  for (const avery_fate of ["descended", "destroyed", "unknown"]) assert.equal(analyze("avery-tower", { avery_fate }).status, "incomplete");
  const historical = analyze("avery-tower", { feats: currentFeat("Pride Cometh") });
  assert.equal(historical.status, "completed");
  assert.match(historical.current, /结局选择后的成就.*尾声需另核对/);
});

test("地下仪式直接结尾字段支持禁成就存档，历史成就只确认逃离", () => {
  const ending = analyze("danube-ritual", { jordan_ritual_dance: 4, cheatsEnabled: true });
  assert.equal(ending.status, "completed");
  assert.match(ending.current, /后续约旦对话已结束/);
  const escaped = analyze("danube-ritual", { feats: currentFeat("Breaking the Stone") });
  assert.equal(escaped.status, "completed");
  assert.match(escaped.current, /后续约旦对话不由成就确认/);
  assert.equal(analyze("danube-ritual", { feats: { allSaves: { "Breaking the Stone": true } } }).status, "uncertain");
  assert.equal(analyze("danube-ritual", { jordan_ritual_dance: 2 }).status, "incomplete");
});

test("节日提议和沐浴首屏都不作为整个节日完成", () => {
  for (const [id, marker] of [["halloween-whitney", "halloweenwhitney"], ["halloween-kylar", "halloweenkylar"], ["valentine-eden", "Eden Valentines Bath"]]) {
    const holiday = analyze(id, { scenePassages: [marker] });
    assert.equal(holiday.status, "seasonal");
    assert.match(holiday.current, /不能确认整个节日事件结束/);
  }
  for (const id of ["halloween-robin", "halloween-eden", "valentine-robin", "christmas-robin", "christmas-eden"]) {
    assert.match(analyze(id, {}).current, /节日窗口结束/);
    assert.doesNotMatch(analyze(id, {}).current, /跨年/);
  }
});

test("悉尼承诺保留实际成功记录，亵渎历史不宣称永久锁定", () => {
  assert.equal(analyze("sydney-promise", { templePromised: "Sydney" }).status, "completed");
  const historical = analyze("sydney-promise", { sydneySeen: ["corruptroom"] });
  assert.equal(historical.status, "alternate");
  assert.doesNotMatch(historical.current, /锁定/);
});

test("棕狐手势只根据本轮奎恩任务结算，不借用其他委托的成功", () => {
  assert.equal(analyze("avery-fox-residue", { avery_mansion: { fox: { task: "Quinn", task_complete: "success" } } }).status, "completed");
  assert.equal(analyze("avery-fox-residue", { avery_mansion: { fox: { task: "Jordan", task_complete: "success" } } }).status, "alternate");
  const failed = analyze("avery-fox-residue", { avery_fate: "saved", avery_mansion: { fox: { task: "Quinn", task_complete: "fail" } } });
  assert.match(failed.current, /委托已失败/);
  assert.match(failed.current, /不再显示于正式日志/);
});

test("NPC 处置读取真实对象数组，并区分死亡、可恢复离开和关押", () => {
  const variables = { NPCName: [{ nam: "Avery", state: "dismissed" }, { nam: "Kylar", state: "prison" }, { nam: "Whitney", state: "dungeon" }] };
  assert.match(analyze("npc-exile-avery", variables).current, /离开恋爱路线.*恢复关系/);
  assert.match(analyze("npc-exile-kylar", variables).current, /监狱.*恢复活动/);
  assert.match(analyze("npc-exile-whitney", variables).current, /地下关押/);
  const kicked = analyze("npc-exile-avery", { avery_fate: "kicked" });
  assert.match(kicked.current, /身亡.*死亡结局/);
  assert.doesNotMatch(kicked.current, /逐出城镇/);
  assert.match(analyze("npc-exile-kylar", { kylar_exile: 1, kylar_prison: 1 }).current, /没有可确认/);
  assert.match(analyze("npc-exile-whitney", { whitney_exile: 1 }).current, /没有可确认/);
});
