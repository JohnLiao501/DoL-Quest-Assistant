import assert from "node:assert/strict";
import test from "node:test";
import { analyzeQuests, formatEvidence, getWikiTitles } from "../src/lib/quest-analyzer.js";

test("任务分析引擎生成中英双语 Wiki 标题与链接", () => {
  const parsed = { variables: {} };
  const quests = analyzeQuests(parsed);

  const farm = quests.find((q) => q.id === "farm");
  assert.ok(farm);
  assert.equal(farm.wikiTitle, "农场袭击");
  assert.equal(farm.enWikiTitle, "Farm Assault");
  assert.equal(farm.wikiUrl, "https://degreesoflewditycn.miraheze.org/wiki/%E5%86%9C%E5%9C%BA%E8%A2%AD%E5%87%BB");
  assert.equal(farm.enWikiUrl, "https://degreesoflewdity.miraheze.org/wiki/Farm%20Assault");

  const bailey = quests.find((q) => q.id === "bailey-payments");
  assert.ok(bailey);
  assert.equal(bailey.wikiTitle, "贝利的付款");
  assert.equal(bailey.enWikiTitle, "Bailey's Payments");
  assert.equal(bailey.enWikiUrl, "https://degreesoflewdity.miraheze.org/wiki/Bailey's%20Payments");
});

test("贝利租金使用 renttime 倒计时，rentday 只代表星期", () => {
  const notRentDay = analyzeQuests({
    variables: { rentday: 7, renttime: 3, rentmoney: 20000, money: 15000 },
  }).find((q) => q.id === "bailey-payments");
  assert.equal(notRentDay.status, "recurring");
  assert.match(notRentDay.current, /还剩 3 天/);

  const rentDaySufficient = analyzeQuests({
    variables: { rentday: 7, renttime: 0, rentmoney: 20000, money: 25000 },
  }).find((q) => q.id === "bailey-payments");
  assert.equal(rentDaySufficient.status, "incomplete");
  assert.match(rentDaySufficient.current, /持有现金充足/);
  assert.doesNotMatch(rentDaySufficient.current, /12 点|12:00/);

  const rentDayShort = analyzeQuests({
    variables: { rentday: 3, renttime: 0, rentmoney: 20000, money: 5000 },
  }).find((q) => q.id === "bailey-payments");
  assert.equal(rentDayShort.status, "incomplete");
  assert.match(rentDayShort.current, /持有现金不足/);
});

test("贝利租金总额包含子女费用，负 renttime 明确显示逾期", () => {
  const payment = analyzeQuests({ variables: {
    rentday: 4, renttime: -2, rentmoney: 20000, babyRent: 10000, money: 25000,
  } }).find((q) => q.id === "bailey-payments");
  assert.equal(payment.status, "incomplete");
  assert.match(payment.current, /逾期 2 天/);
  assert.match(payment.current, /需付 £300.*缺少 £50/);
  assert.ok(payment.evidence.some((e) => /附加费用：£100/.test(e)));

  const ready = analyzeQuests({ variables: {
    rentday: 1, renttime: 2, rentmoney: 20000, babyRent: 10000, money: 30000,
  } }).find((q) => q.id === "bailey-payments");
  assert.equal(ready.status, "recurring");
  assert.match(ready.next.join(" "), /资金已备齐/);

  const missingCountdown = analyzeQuests({ variables: {
    rentday: 6, rentmoney: 20000, money: 30000,
  } }).find((q) => q.id === "bailey-payments");
  assert.equal(missingCountdown.status, "uncertain");
  assert.doesNotMatch(missingCountdown.current, /还剩 6 天/);
});

test("0.5.12 活动禁闭记录暂停租金，结束记录或非指定地点不会暂停", () => {
  const payment = (badEndStats) => analyzeQuests({ variables: {
    renttime: -1, rentday: 4, rentmoney: 20000, money: 0, badEndStats,
  } }).find((q) => q.id === "bailey-payments");

  for (const source of ["Prison", "Asylum", "Underground Farm", "Underground Dungeon"]) {
    const active = payment([{ source, trackedStart: 1234 }]);
    assert.equal(active.status, "recurring", source);
    assert.match(active.current, /租金倒计时暂停/);
    assert.doesNotMatch(active.next.join(" "), /筹款|前往孤儿院|交给贝利/);
  }
  const ended = payment([{ source: "Asylum", trackedStart: 1234, trackedEnd: 5678 }]);
  assert.equal(ended.status, "incomplete");
  assert.match(ended.current, /逾期 1 天/);
  assert.equal(payment([{ source: "Asylum", trackedStart: "1234" }]).status, "incomplete");
  assert.equal(payment([{ source: "Underground", trackedStart: 1234 }]).status, "incomplete");
  assert.equal(payment([
    { source: "Asylum", trackedStart: 1234 },
    { source: "Prison", trackedStart: 2345, trackedEnd: 3456 },
  ]).status, "incomplete");
});

test("学校项目使用游戏真实的科学、数学与英语话剧状态", () => {
  const incomplete = analyzeQuests({
    variables: {
      scienceproject: "done",
      mathsproject: "ongoing",
      englishPlay: "ongoing",
    },
  }).find((q) => q.id === "school-projects");
  assert.equal(incomplete.status, "incomplete");
  assert.equal(incomplete.progress.value, 1);
  assert.equal(incomplete.progress.max, 3);
  assert.match(incomplete.current, /英语话剧/);
  assert.doesNotMatch(incomplete.current, /历史|美术/);

  const allCompleted = analyzeQuests({
    variables: {
      scienceproject: "won",
      scienceprojectwon: 1,
      mathsproject: "won",
      englishPlay: "done",
    },
  }).find((q) => q.id === "school-projects");
  assert.equal(allCompleted.status, "completed");
  assert.equal(allCompleted.progress.value, 3);

  const invalidOldFields = analyzeQuests({
    variables: { historyproject: 100, artproject: 100 },
  }).find((q) => q.id === "school-projects");
  assert.equal(invalidOldFields.progress.value, 0);
  assert.equal(invalidOldFields.progress.max, 3);
});

test("0.5.12 鱼饵店委托必须交付才完成，钓到指定鱼仍待交付", () => {
  // Bait Shop Request -> Fishing catch -> Bait Shop Give Fish。
  const request = (state, total = 0) => analyzeQuests({ variables: {
    fishing: { baitShopRequestsCompleted: total },
    daily: { fishing: { baitShopRequest: state, baitShopRequestFish: "haddock" } },
  } }).find((q) => q.id === "fishing-request");

  const offered = request("willRequest");
  assert.equal(offered.status, "incomplete");
  assert.match(offered.current, /尚未接受/);
  assert.match(offered.next.join(" "), /13:00 前接取.*19:00.*交付/);

  const requested = request("requested", 4);
  assert.equal(requested.status, "incomplete");
  assert.match(requested.current, /黑线鳕/);
  assert.match(requested.current, /今天新钓到/);

  const caught = request("ready", 4);
  assert.equal(caught.status, "incomplete");
  assert.match(caught.current, /还没有交/);
  assert.match(caught.next.join(" "), /19:00/);

  const delivered = request("delivered", 5);
  assert.equal(delivered.status, "completed");
  assert.match(delivered.current, /今天.*已.*交付.*5 次/);

  const resetNextDay = request(undefined, 5);
  assert.equal(resetNextDay.status, "recurring");
  assert.doesNotMatch(resetNextDay.current, /已经交付/);
  assert.equal(request("notToday", 5).status, "recurring");
});

test("鱼饵店委托对旧存档与未识别状态保持保守", () => {
  const oldSave = analyzeQuests({ variables: {} }).find((q) => q.id === "fishing-request");
  assert.equal(oldSave.status, "locked");
  const futureState = analyzeQuests({ variables: {
    fishing: {},
    daily: { fishing: { baitShopRequest: "future-state", baitShopRequestFish: "custom-fish" } },
  } }).find((q) => q.id === "fishing-request");
  assert.equal(futureState.status, "uncertain");
  const unknownFish = analyzeQuests({ variables: {
    fishing: {}, daily: { fishing: { baitShopRequest: "requested", baitShopRequestFish: "custom-fish" } },
  } }).find((q) => q.id === "fishing-request");
  assert.equal(unknownFish.status, "incomplete");
  assert.match(unknownFish.note, /鱼种未收录/);
});

test("伦恩舞会劫案只认结尾记录，邀请、赴约和爽约不能算完成", () => {
  const heist = (variables) => analyzeQuests({ variables }).find((q) => q.id === "wren-heist");
  assert.equal(heist({}).status, "locked");
  const accepted = heist({ wrenHeist: true, wrenHeistDance: {}, wrenHeistMonthly: 30 });
  assert.equal(accepted.status, "incomplete");
  assert.match(accepted.next.join(" "), /19:00.*21:00.*多瑙河街/);
  const attended = heist({ wrenHeist: true, wrenHeistDance: { attended: true } });
  assert.equal(attended.status, "incomplete");
  assert.match(attended.current, /赴约记录本身不能确认/);
  assert.equal(heist({ wrenHeist: false, wrenHeistMonthly: 30 }).status, "recurring");
  const missed = heist({ wrenHeistMissed: true, wrenHeistMonthly: 20 });
  assert.equal(missed.status, "recurring");
  assert.match(missed.current, /爽约/);

  // Wren Heist End 写入持久 wrenSeen 标记；下一次邀约不能被称作本轮已完成。
  const finished = heist({ wrenSeen: ["heist"], wrenHeistMonthly: 12 });
  assert.equal(finished.status, "completed");
  assert.match(finished.current, /至少结束过一次.*可重复/);
  const repeat = heist({ wrenSeen: ["heist"], wrenHeist: true, wrenHeistDance: {} });
  assert.equal(repeat.status, "completed");
  assert.match(repeat.current, /本轮已接受邀请，尚未赴约/);
  assert.match(repeat.note, /只表示至少体验过一次/);
});

test("警局密码阶段不等于渗透完成，成功档案操作单独判定", () => {
  const police = (variables) => analyzeQuests({ variables }).find((q) => q.id === "police-infiltration");
  for (const police_hack of [1, 2, 4, 5]) {
    assert.equal(police({ police_hack }).status, "incomplete", `密码阶段 ${police_hack}`);
  }
  assert.match(police({ police_hack: 1 }).current, /登录障碍/);
  assert.match(police({ police_hack: 2 }).current, /委托尚未完成/);
  assert.match(police({ police_hack: 4 }).current, /更新密码/);
  assert.match(police({ police_hack: 5 }).next.join(" "), /倒钩街/);

  // Widgets Police 成功操作增加 police_delete，Police Sneak Caught 会将其清零。
  const operated = police({ police_hack: 4, police_delete: 1 });
  assert.equal(operated.status, "completed");
  assert.match(operated.current, /成功执行 1 次档案操作/);
  assert.match(operated.note, /不代表所有案底已清零/);
  assert.equal(police({ police_hack: 5, police_delete: 0 }).status, "incomplete");
});

test("码头基础对象和刷新中的区域信息不能确认潜入历史完成", () => {
  const docks = (variables, overrides) => analyzeQuests({ variables }, overrides)
    .find((q) => q.id === "docks-infiltration");
  const initialized = docks({ docks: { hired: false } });
  assert.equal(initialized.status, "uncertain");
  assert.doesNotMatch(initialized.current, /已踏足|尚未探索/);
  const checked = docks({ skul_dock: { NW: { state: "empty" }, N: { state: "known" } } });
  assert.equal(checked.status, "uncertain");
  assert.match(checked.note, /普通访问.*刷新/);
  assert.equal(docks({}, { "docks-infiltration": true }).status, "completed");
});

test("查理工作使用舞蹈室与本周状态，结束不等于永久或成功完成", () => {
  const charlie = (variables) => analyzeQuests({ variables }).find((q) => q.id === "charlie-jobs");
  assert.equal(charlie({ danceStudio: { intro: true } }).status, "locked");
  assert.equal(charlie({ danceStudio: { jobOffered: true } }).status, "recurring");
  for (const danceJob of ["docks", "party", "stage"]) {
    const offered = charlie({ danceStudio: { jobOffered: true }, weekly: { danceJob } });
    assert.equal(offered.status, "recurring");
    assert.match(offered.current, /尚未开始演出/);
    const ongoing = charlie({ danceStudio: { jobOffered: true, job: { time: 180 } }, weekly: { danceJob } });
    assert.equal(ongoing.status, "incomplete");
    assert.match(ongoing.current, /正在进行/);
  }
  const ended = charlie({ danceStudio: { jobOffered: true }, weekly: { danceJob: "done" } });
  assert.equal(ended.status, "completed");
  assert.match(ended.current, /本周.*结束.*下周/);
  assert.match(ended.note, /不表示工作永久完成或演出成功/);
});

test("兰德里黑匣子按真实目的地和待交付标记读取，无记录时不猜历史", () => {
  const landry = (variables) => analyzeQuests({ variables }).find((q) => q.id === "landrys-request");
  for (const [pubtask, destination] of [["forest", "森林"], ["moor", "荒原"], ["sewers", "下水道"]]) {
    const active = landry({ pubtask });
    assert.equal(active.status, "incomplete");
    assert.ok(active.current.includes(destination));
    assert.doesNotMatch(active.current, /海底|打捞/);
  }
  const found = landry({ pubtask: "forest", pubtask2: 1 });
  assert.equal(found.status, "incomplete");
  assert.match(found.current, /已找到.*酒吧交付/);
  assert.match(found.next.join(" "), /酒吧.*兰德里/);
  const cleared = landry({ pub_task_stat: 10 });
  assert.equal(cleared.status, "uncertain");
  assert.match(cleared.current, /未接取.*已经交付/);
  assert.equal(landry({ landry: 2, blackbox: 2, landry_loft_known: 1 }).status, "uncertain");
});

test("神殿贞洁誓言根据成员身份与实际誓言记录判定", () => {
  const outsider = analyzeQuests({
    variables: { temple_rank: "" },
  }).find((q) => q.id === "chastity-vow");
  assert.equal(outsider.status, "locked");

  const monkWithoutBelt = analyzeQuests({
    variables: { temple_rank: "monk", player: { virginity: { temple: true } }, worn: { genitals: { name: "none" } } },
  }).find((q) => q.id === "chastity-vow");
  assert.equal(monkWithoutBelt.status, "completed");

  const monkWithBelt = analyzeQuests({
    variables: { temple_rank: "monk", player: { virginity: { temple: false } }, worn: { genitals: { name: "steel chastity belt" } } },
  }).find((q) => q.id === "chastity-vow");
  assert.equal(monkWithBelt.status, "incomplete");
});

test("getWikiTitles 返回包含新增任务的去重标题列表", () => {
  const titles = getWikiTitles();
  assert.ok(titles.includes("贝利的付款"));
  assert.ok(titles.includes("学校项目"));
  assert.ok(titles.includes("走私者"));
  assert.ok(titles.includes("潜入码头"));
  assert.ok(titles.includes("渗透警局"));
  assert.ok(titles.includes("贞洁誓言"));
  assert.ok(titles.includes("查理的工作"));
  assert.ok(titles.includes("在多瑙河街入室盗窃"));
});

test("formatEvidence 自动隐藏技术性存档字段并保持自然语言描述", () => {
  const raw = [
    "科学项目：未完成（存档字段：scienceproject）",
    "数学项目：已完成(存档字段: mathsproject)",
    "农场建设阶段：1/12（存档字段 farm_stage）",
    "已达到当前版本的最终建设阶段",
  ];
  const cleaned = formatEvidence(raw);
  assert.deepEqual(cleaned, [
    "科学项目：未完成",
    "数学项目：已完成",
    "农场建设阶段：1/12",
    "已达到当前版本的最终建设阶段",
  ]);

  // 验证生成的 quest.evidence 中不含任何“存档字段”字样
  const quests = analyzeQuests({
    variables: {
      scienceproject: "done",
      mathsproject: "done",
      englishPlay: "done",
      farm_stage: 5,
      farm: { clearing: 30 },
    },
  });
  for (const quest of quests) {
    for (const evidence of quest.evidence) {
      assert.doesNotMatch(evidence, /存档字段/);
    }
  }
});

test("重复活动使用真实游戏字段，区分本轮行动与永久完成", () => {
  const quests = analyzeQuests({
    variables: {
      gwylan_rescue: 1,
      gwylan: {},
      gwylanSeen: ["ritual_beast"],
      detention: 50,
      community_service: 3,
      pillory: { audience: 20 },
      pubtask: "forest",
      pubtask2: 1,
      stat_panties_stolen: 5,
      farm_stage: 8,
      estate: { vials: "shattered" },
      science_exam: 80,
      maths_exam: 85,
      english_exam: 90,
      history_exam: 75,
      sciencetrait: 3,
      mathstrait: 2,
      englishtrait: 1,
      historytrait: 4,
      temple_rank: "priest",
      danube_housekeeping: 1,
      demon: 6,
      exhibitionism: 80,
      exhibitionismrun: "cliff",
      exhibitionismrunon: 3,
    },
  });

  const gwylan = quests.find((q) => q.id === "gwylans-rituals");
  assert.ok(gwylan);
  assert.equal(gwylan.status, "recurring");

  const detention = quests.find((q) => q.id === "detention");
  assert.ok(detention);
  assert.equal(detention.status, "incomplete");
  assert.match(detention.current, /50 点学校留堂惩罚/);

  const community = quests.find((q) => q.id === "community-service");
  assert.ok(community);
  assert.equal(community.status, "incomplete");
  assert.match(community.current, /3 天社区服务/);

  const pillory = quests.find((q) => q.id === "pillory");
  assert.ok(pillory);
  assert.equal(pillory.status, "incomplete");

  const landry = quests.find((q) => q.id === "landrys-request");
  assert.ok(landry);
  assert.equal(landry.status, "incomplete");
  assert.match(landry.current, /已找到.*酒吧交付/);

  const remy = quests.find((q) => q.id === "sabotaging-remy");
  assert.ok(remy);
  assert.equal(remy.status, "completed");

  const exams = quests.find((q) => q.id === "school-exams");
  assert.ok(exams);
  assert.equal(exams.status, "recurring");

  const trial = quests.find((q) => q.id === "trial-by-fire");
  assert.ok(trial);
  assert.equal(trial.status, "uncertain");

  const danubeJobs = quests.find((q) => q.id === "danube-jobs");
  assert.ok(danubeJobs);
  assert.equal(danubeJobs.status, "recurring");

  const domusHunting = quests.find((q) => q.id === "domus-hunting");
  assert.ok(domusHunting);
  assert.equal(domusHunting.status, "recurring");

  const ex = quests.find((q) => q.id === "exhibitionism");
  assert.ok(ex);
  assert.equal(ex.status, "incomplete");
});

test("真实成绩评级与基础理解度分别显示，理解度和金额取整", () => {
  const quests = analyzeQuests({
    variables: {
      science_exam: 1.2,
      maths_exam: 10.68,
      english_exam: 24.959999999999997,
      history_exam: 0.8999999999999999,
      sciencetrait: 1,
      mathstrait: 2,
      englishtrait: 3,
      historytrait: 4,
      rentday: 7,
      renttime: 4,
      rentmoney: 400000,
      money: 13707491,
    },
  });

  const exams = quests.find((q) => q.id === "school-exams");
  assert.ok(exams);
  // 必须是与游戏原生属性面板一致的向下取整结果
  assert.match(exams.current, /科学 C \/ 数学 B \/ 英语 A \/ 历史 A\*/);
  assert.doesNotMatch(exams.current, /\d+\.\d+/);
  assert.deepEqual(exams.evidence, [
    "科学 C；基础理解度：1",
    "数学 B；基础理解度：10",
    "英语 A；基础理解度：24",
    "历史 A*；基础理解度：0",
  ]);

  const bailey = quests.find((q) => q.id === "bailey-payments");
  assert.ok(bailey);
  assert.match(bailey.current, /需交 £4000，当前持有现金 £137074/);
  assert.doesNotMatch(bailey.current, /£\d+\.\d+/);
});

test("中文 Wiki 导航标题快照均有对应条目或分类", () => {
  const cnNavbox = [
    "Tenyclus", "个人任务", "主线任务", "亵渎仪式", "伊甸的万圣节", "伊甸的圣诞节",
    "伊甸的情人节", "兰德里的请求", "农场袭击", "凯拉尔的万圣节", "凯拉尔的绑架",
    "分裂", "勒索礼顿", "咖啡馆活动", "因兴奋剂被绑架", "在多瑙河街入室盗窃",
    "在多瑙河街寻找工作", "在宅邸街入室盗窃", "在宅邸街夜间狩猎", "在宅邸街寻找工作",
    "在荒原被绑架", "多伦的担忧", "夜魔", "学习飞行", "学校考试", "学校项目",
    "惠特尼的万圣节", "承诺仪式", "放逐NPC", "放逐凯拉尔", "放逐惠特尼", "放逐艾弗里",
    "数学竞赛", "暴露任务", "查里的工作", "洗劫锁柜", "渗透警局", "潜入码头",
    "留堂", "破坏雷米农场", "礼顿的勒索", "礼顿的检查", "社会服务", "神殿",
    "神殿晋升", "科学博览会", "罗宾的万圣节", "罗宾的任务", "罗宾的圣诞节",
    "舞台剧", "节日", "贝利的付款", "走私者", "颈手枷"
  ];

  const allQuests = analyzeQuests({ variables: {} });
  const allTitles = new Set([
    ...allQuests.map((q) => q.wikiTitle),
    ...allQuests.map((q) => q.title),
    "主线任务", "个人任务", "节日", "神殿", // 分类与汇总页
  ]);

  const unhandled = cnNavbox.filter((title) => {
    const normalized = title.replace("查里", "查理");
    return !allTitles.has(title) && !allTitles.has(normalized);
  });

  assert.deepEqual(unhandled, [], "核对标题映射，不代表游戏分支功能完整覆盖");
});

test("英文 Wiki 导航标题快照均有对应条目或分类", () => {
  const enTargets = [
    "Bailey's Payments", "Blackmailed by Leighton", "Blackmailing Leighton",
    "Cafe Campaign", "Charlie's Jobs", "Community Service", "Danube Street Burglary",
    "Danube Street Jobs", "Detention", "Dismissing Avery", "Dismissing Kylar",
    "Dismissing NPCs", "Dismissing Whitney", "Docks Infiltration", "Doren's Concerns",
    "Eden's Halloween", "Eden's Valentines", "Farm Assault", "Festivities",
    "Kylar's Halloween", "Landry's Request", "Leighton's Inspections", "Locker Raid",
    "Main Quests", "Maths Competition", "Moor Abduction", "Night Monster",
    "Personal Quests", "Pillory", "Police Infiltration", "Repeatable Quests",
    "Rite of Defilement", "Rite of Promise", "Robin's Christmas", "Robin's Halloween",
    "Robin's Quest", "Sabotaging Remy", "School Exams", "School Projects",
    "Science Fair", "Smugglers", "Stimulant Kidnapping", "Story Quests",
    "Taking Flight", "Tenyclus", "Whitney's Halloween", "Temple Initiation",
    "Chastity Vow", "Trial by Fire", "Gwylan's Rituals"
  ];

  const allQuests = analyzeQuests({ variables: {} });
  const allEnTitles = new Set([
    ...allQuests.map((q) => q.enWikiTitle),
    "Main Quests", "Personal Quests", "Repeatable Quests", "Story Quests", "Festivities", // 目录分类导航页
  ]);

  const unhandled = enTargets.filter((title) => !allEnTitles.has(title));

  assert.deepEqual(unhandled, [], "核对标题映射，不代表游戏分支功能完整覆盖");
});
