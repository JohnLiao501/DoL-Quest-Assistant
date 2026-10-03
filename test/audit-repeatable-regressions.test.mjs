import assert from "node:assert/strict";
import test from "node:test";
import { analyzeQuests } from "../src/lib/quest-analyzer.js";

const read = (id, variables = {}) => analyzeQuests({ variables }).find((quest) => quest.id === id);

test("两条街道盗窃不依赖虚构踩点字段，也不猜测永久完成", () => {
  for (const [id, threshold] of [["danube-burglary", 300], ["domus-burglary", 100]]) {
    for (const variables of [{}, { skulduggery: 0 }, { skulduggery: 1000 }, { burglar: 9, danube_burglar: 9, domus_burglar: 9 }]) {
      const result = read(id, variables);
      assert.equal(result.status, "recurring");
      assert.match(result.current, /无法确认是否曾完成/);
      assert.ok(result.next.join(" ").includes(`有效诡术至少 ${threshold}`));
      assert.match(result.next.join(" "), /夜间.*双手未被绑/);
      assert.doesNotMatch(result.current, /已踩点|尚未发现|完成.*次/);
    }
  }
});

test("格威兰初始化对象和仅见面都不能当作仪式完成", () => {
  assert.equal(read("gwylans-rituals", { gwylan: { progress: 0, request: {}, timer: {} }, gwylanSeen: [] }).status, "locked");
  for (const key of ["forest_shop_intro", "gwylan_rescue", "gwylan_cafe_intro", "gwylan_hunt_intro"]) {
    const result = read("gwylans-rituals", { [key]: 1, gwylan: {} });
    assert.equal(result.status, "recurring");
    assert.match(result.current, /没有可识别的仪式结尾记录/);
  }
});

test("格威兰历史体验、正在进行仪式和当前委托分别识别", () => {
  for (const marker of ["ritual_beast", "ritual_sex"]) {
    const previous = read("gwylans-rituals", { gwylanSeen: [marker], gwylan: {} });
    assert.equal(previous.status, "recurring");
    assert.match(previous.current, /已体验过/);
    for (const active of ["beastRitual", "sexRitual"]) {
      const running = read("gwylans-rituals", { gwylanSeen: [marker], [active]: { progress: 1 } });
      assert.equal(running.status, "incomplete");
      assert.match(running.current, /正在进行.*尚未结束/);
    }
  }
  const request = read("gwylans-rituals", { gwylan: { request: { event: "ingredients", items: [{ name: "feathers", need: 3 }] } } });
  assert.equal(request.status, "incomplete");
  assert.match(request.current, /收集指定材料/);
  assert.equal(read("gwylans-rituals", { gwylan: { request: { event: "unknown-future-event" } } }).status, "uncertain");
});

test("格威兰委托时限与仪式冷却使用起始时间加相对时间", () => {
  const startDate = 864000;
  const timeStamp = 3600;
  const expired = read("gwylans-rituals", { startDate, timeStamp, gwylan: { request: { event: "meetAtShop", timer: startDate + 3599 } } });
  assert.equal(expired.status, "uncertain");
  assert.match(expired.current, /时限已过/);
  const current = read("gwylans-rituals", { startDate, timeStamp, gwylan: { request: { event: "meetAtCafe", timer: startDate + 86400 } } });
  assert.equal(current.status, "incomplete");
  assert.match(current.current, /7:20–9:20/);
  const cooldown = read("gwylans-rituals", { startDate, timeStamp, gwylanSeen: ["ritual_beast"], gwylan: { timer: { ritual: startDate + 7 * 86400 } } });
  assert.match(cooldown.current, /还有 7 天/);
  const ready = read("gwylans-rituals", { startDate, timeStamp: 8 * 86400, gwylanSeen: ["ritual_beast"], gwylan: { timer: { ritual: startDate + 7 * 86400 } } });
  assert.equal(ready.status, "recurring");
  assert.doesNotMatch(ready.current, /还有.*天/);
});

test("纯洁入教和本周开始火考都不能确认火考成功", () => {
  for (const variables of [{ temple_rank: "initiate" }, { temple_rank: "monk" }, { weekly: { templeFire: true } }, { temple_rank: "priest", weekly: { templeFire: true } }]) {
    const result = read("trial-by-fire", variables);
    assert.equal(result.status, "uncertain");
    assert.match(result.current, /不能确认/);
  }
  assert.notEqual(read("trial-by-fire", { temple_rank: "sister" }).status, "completed");
  assert.notEqual(read("trial-by-fire", { temple_rank: "" }).status, "completed");
});

test("考试理解度高不代表好成绩，成功后理解度归零不抹掉 A 星评级", () => {
  const variables = {};
  for (const key of ["science", "maths", "english", "history"]) {
    variables[`${key}_exam`] = 80;
    variables[`${key}trait`] = 0;
  }
  const before = read("school-exams", variables);
  assert.equal(before.status, "recurring");
  assert.match(before.current, /科学 D \/ 数学 D \/ 英语 D \/ 历史 D/);
  assert.doesNotMatch(before.current, /全科通过|平均分/);
  assert.match(before.evidence.join(" "), /基础理解度：80/);
  for (const key of ["science", "maths", "english", "history"]) {
    variables[`${key}_exam`] = 0;
    variables[`${key}trait`] = 4;
  }
  const after = read("school-exams", variables);
  assert.equal(after.status, "recurring");
  assert.match(after.current, /科学 A\* \/ 数学 A\* \/ 英语 A\* \/ 历史 A\*/);
  assert.match(after.note, /不能证明本周已通过/);
});

test("考试 F D C B 评级与缺失字段按真实 trait 表示", () => {
  const result = read("school-exams", { sciencetrait: -1, mathstrait: 0, englishtrait: 1, historytrait: 2 });
  assert.equal(result.status, "recurring");
  assert.match(result.current, /科学 F \/ 数学 D \/ 英语 C \/ 历史 B/);
  const partial = read("school-exams", { sciencetrait: 3, maths_exam: 99 });
  assert.equal(partial.status, "uncertain");
  assert.match(partial.current, /科学 A \/ 数学 未知/);
  assert.doesNotMatch(partial.current, /全科通过/);
});

test("留堂零积压只证明积压清除，不证明操行或处罚结束", () => {
  const cleared = read("detention", { detention: 0, delinquency: 1000, daily: { school: { detentionAttended: 1 } } });
  assert.match(cleared.current, /没有积压/);
  assert.doesNotMatch(cleared.current, /操行.*良好/);
  assert.match(cleared.note, /不代表.*处罚场景已经结束/);
  const backlog = read("detention", { detention: 50 });
  assert.equal(backlog.status, "incomplete");
  assert.match(backlog.current, /50 点/);
  const attended = read("detention", { detention: 3, daily: { school: { detentionAttended: 1 } } });
  assert.match(attended.next.join(" "), /继续当前处罚流程/);
  assert.equal(read("detention").status, "uncertain");
});

test("社区服务是剩余天数，今日已履行不能再次接取", () => {
  const current = read("community-service", { community_service: 4 });
  assert.equal(current.status, "incomplete");
  assert.match(current.current, /4 天/);
  assert.match(current.next.join(" "), /6:00–21:00.*不含 21:00.*倒钩街警局/);
  assert.doesNotMatch(current.next.join(" "), /市政厅/);
  const attended = read("community-service", { community_service: 4, community_service_done: 1 });
  assert.match(attended.current, /今天已履行/);
  assert.doesNotMatch(attended.next.join(" "), /接取当天服务/);
  assert.match(attended.note, /开始时递减/);
  assert.doesNotMatch(read("community-service", {}).current, /从未/);
});

test("社区服务在精神病院、监狱及当天禁闭状态暂停", () => {
  for (const variables of [{ location: "asylum" }, { location: "prison" }, { daily: { asylumPrison: true } }]) {
    const result = read("community-service", { community_service: 5, ...variables });
    assert.equal(result.status, "incomplete");
    assert.match(result.current, /暂停/);
    assert.doesNotMatch(result.next.join(" "), /前往.*警局/);
  }
});

test("颈手枷初始化、NPC 受刑及旧时间不等于玩家受刑或历史完成", () => {
  for (const pillory of [{}, { tenant: { exists: true, special: { name: "Leighton" } } }, { time: { end: 9999 } }]) {
    const result = read("pillory", { pillory });
    assert.equal(result.status, "uncertain");
    assert.doesNotMatch(result.current, /当前正被锁/);
  }
  const free = read("pillory", { pillory: { audience: 0, tenant: { exists: true }, time: { end: 9999 } } });
  assert.equal(free.status, "recurring");
  assert.match(free.note, /不代表历史刑期完成/);
  const active = read("pillory", { pillory: { audience: 1 } });
  assert.equal(active.status, "incomplete");
  assert.match(active.current, /当前正被锁/);
  assert.equal(read("pillory", { pillory_tenant: { exists: true } }).status, "uncertain");
});

test("锁柜统计只确认偷取内衣，不伪造开柜次数", () => {
  const stolen = read("locker-raid", { stat_panties_stolen: 5, locker_suspicion: 8 });
  assert.equal(stolen.status, "recurring");
  assert.match(stolen.current, /累计：5 件/);
  assert.match(stolen.evidence.join(" "), /嫌疑度：8/);
  assert.match(stolen.note, /不是开启柜子的次数/);
  const onlySuspicion = read("locker-raid", { stat_panties_stolen: 0, locker_suspicion: 10 });
  assert.equal(onlySuspicion.status, "recurring");
  assert.doesNotMatch(onlySuspicion.current, /尚未尝试/);
  assert.equal(read("locker-raid", { lockers_looted: 99 }).status, "uncertain");
});

test("多瑙河工作识别成功试工资格，并保留重复工作状态", () => {
  const unlocked = read("danube-jobs", { danube_housekeeping: 1 });
  assert.equal(unlocked.status, "recurring");
  assert.match(unlocked.current, /通过.*试工/);
  assert.match(unlocked.note, /不是完成次数/);
  const locked = read("danube-jobs", { danube_jobs: 2, danubework: 10, housekeeping: 299 });
  assert.equal(locked.status, "locked");
  assert.match(locked.next.join(" "), /家政技能至少 300/);
});

test("雷米破坏从农场第五阶段出现线索，进门和结束访问不是完成证据", () => {
  assert.equal(read("sabotaging-remy", { farm_stage: 4 }).status, "locked");
  for (const fence of ["quest", "bird", "landry", "secret"]) {
    const result = read("sabotaging-remy", { farm_stage: 5, estate_fence: fence, remy_sabotaged: 1, daily: { estateDone: true }, farm: { aggro: 0 } });
    assert.equal(result.status, "uncertain");
    assert.match(result.current, /历史结果无法确认/);
  }
  assert.equal(read("sabotaging-remy", { farm_stage: 7, estate: { cards: { cattle: 1 } } }).status, "incomplete");
});

test("雷米破坏识别本次药瓶与四项真实削弱行动，离开后不猜历史", () => {
  const vials = read("sabotaging-remy", { farm_stage: 5, estate: { vials: "shattered" } });
  assert.equal(vials.status, "completed");
  assert.match(vials.current, /本次.*打碎药瓶/);
  for (const key of ["steeds", "weapons", "cars", "fire"]) {
    const result = read("sabotaging-remy", { farm_stage: 5, estate: { cards: { [key]: 1 } } });
    assert.equal(result.status, "completed");
    assert.match(result.note, /离开庄园会清除/);
  }
  const left = read("sabotaging-remy", { farm_stage: 8, daily: { estateDone: true } });
  assert.equal(left.status, "uncertain");
});

test("宅邸工作没有全区总次数，阁楼和收入不证明全区历史", () => {
  for (const variables of [{}, { domus_jobs: 9, domuswork: 9 }, { domusLoft: 2, daily: { domusLoft: true }, money: 100000 }]) {
    const result = read("domus-jobs", variables);
    assert.equal(result.status, "recurring");
    assert.doesNotMatch(result.current, /尚未.*承接|已完成.*次/);
    assert.match(result.current, /无法确认全区工作历史/);
  }
});

test("恶魔形态不单独证明狩猎可用，基础值与有效值修正分开说明", () => {
  assert.equal(read("domus-hunting", { demon: 5, promiscuity: 100 }).status, "locked");
  for (const variables of [{ demon: 6, promiscuity: 0, drunk: 0, heat: 0, rut: 0 }, { demon: 6, promiscuity: 15 }, { demon: 6, promiscuity: 0, drunk: 1000 }, { demon: 6, domus_hunting: 9, daily: { demonWindowOrphan: 1 } }]) {
    const result = read("domus-hunting", variables);
    assert.equal(result.status, "recurring");
    assert.match(result.current, /有效淫乱值至少 15/);
    assert.match(result.next.join(" "), /醉酒和发情修正/);
    assert.doesNotMatch(result.current, /已具备.*经验|可在夜间.*寻觅猎物|狩猎记录.*次/);
  }
});

test("暴露技能 75 不完成任何一段正在进行的神秘纸条挑战", () => {
  for (const [run, stage] of [["danube", 0], ["danube", 1], ["starfish", 2], ["cliff", 3]]) {
    const result = read("exhibitionism", { exhibitionism: 75, exhibitionismrun: run, exhibitionismrunon: stage });
    assert.equal(result.status, "incomplete");
    assert.match(result.current, /本段尚待执行/);
    assert.equal(result.progress.value, stage);
    assert.equal(result.progress.max, 4);
  }
  assert.equal(read("exhibitionism", { exhibitionismrun: "cliff", exhibitionismrunon: 0 }).status, "uncertain");
});

test("暴露挑战中间段已推进，最终清空后保持历史未知", () => {
  for (const stage of [1, 2, 3]) {
    const result = read("exhibitionism", { exhibitionism: 0, exhibitionismrunon: stage });
    assert.equal(result.status, "incomplete");
    assert.match(result.current, /等待下一段邀请/);
    assert.equal(result.progress.value, stage);
  }
  for (const variables of [{}, { exhibitionism: 100, challengetimer: 0 }]) {
    const result = read("exhibitionism", variables);
    assert.equal(result.status, "uncertain");
    assert.match(result.current, /无法区分尚未开始和已经完成/);
  }
});

test("兰德里三地点和已取匣子仍待交付，清除后不假设完成", () => {
  for (const pubtask of ["forest", "moor", "sewers"]) {
    assert.equal(read("landrys-request", { pubtask }).status, "incomplete");
    assert.match(read("landrys-request", { pubtask, pubtask2: 1 }).current, /尚待.*交付/);
  }
  assert.equal(read("landrys-request", {}).status, "uncertain");
});
