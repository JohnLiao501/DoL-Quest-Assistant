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

test("贝利周常租金按交租日和持有资金判定状态", () => {
  const notRentDay = analyzeQuests({
    variables: { rentday: 3, rentmoney: 20000, money: 15000 },
  }).find((q) => q.id === "bailey-payments");
  assert.equal(notRentDay.status, "recurring");
  assert.match(notRentDay.current, /还剩 3 天/);

  const rentDaySufficient = analyzeQuests({
    variables: { rentday: 0, rentmoney: 20000, money: 25000 },
  }).find((q) => q.id === "bailey-payments");
  assert.equal(rentDaySufficient.status, "incomplete");
  assert.match(rentDaySufficient.current, /持有现金充足/);

  const rentDayShort = analyzeQuests({
    variables: { rentday: 0, rentmoney: 20000, money: 5000 },
  }).find((q) => q.id === "bailey-payments");
  assert.equal(rentDayShort.status, "incomplete");
  assert.match(rentDayShort.current, /持有现金不足/);
});

test("学校学术项目根据四大科目作业进度综合判定", () => {
  const incomplete = analyzeQuests({
    variables: {
      scienceproject: "done",
      mathsproject: "ongoing",
      historyproject: 40,
      artproject: 0,
    },
  }).find((q) => q.id === "school-projects");
  assert.equal(incomplete.status, "incomplete");
  assert.equal(incomplete.progress.value, 1);
  assert.equal(incomplete.progress.max, 4);

  const allCompleted = analyzeQuests({
    variables: {
      scienceprojectwon: 1,
      mathsproject: "done",
      historyproject: 100,
      artproject: 100,
    },
  }).find((q) => q.id === "school-projects");
  assert.equal(allCompleted.status, "completed");
  assert.equal(allCompleted.progress.value, 4);
});

test("神殿贞洁誓言根据身份与装备状态判定", () => {
  const outsider = analyzeQuests({
    variables: { temple_rank: "" },
  }).find((q) => q.id === "chastity-vow");
  assert.equal(outsider.status, "locked");

  const monkWithoutBelt = analyzeQuests({
    variables: { temple_rank: "monk", worn: { genitals: { name: "none" } } },
  }).find((q) => q.id === "chastity-vow");
  assert.equal(monkWithoutBelt.status, "incomplete");

  const monkWithBelt = analyzeQuests({
    variables: { temple_rank: "monk", worn: { genitals: { name: "steel chastity belt" } } },
  }).find((q) => q.id === "chastity-vow");
  assert.equal(monkWithBelt.status, "completed");
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
      historyproject: 100,
      artproject: 100,
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

test("新增核心任务（格威兰、留堂、社会服务、兰德里、破坏雷米农场等）正确判定", () => {
  const quests = analyzeQuests({
    variables: {
      gwylan_rescue: 1,
      gwylan: {},
      detention: 50,
      community_service: 3,
      pillory: 1,
      landry: 2,
      lockers_looted: 5,
      farm_stage: 8,
      remy_sabotaged: 1,
      science_exam: 80,
      maths_exam: 85,
      english_exam: 90,
      history_exam: 75,
      temple_rank: "priest",
      danube_jobs: 2,
      domus_jobs: 1,
      demon: 6,
      domus_hunting: 2,
      exhibitionism: 80,
    },
  });

  const gwylan = quests.find((q) => q.id === "gwylans-rituals");
  assert.ok(gwylan);
  assert.equal(gwylan.status, "completed");

  const detention = quests.find((q) => q.id === "detention");
  assert.ok(detention);
  assert.equal(detention.status, "incomplete");
  assert.match(detention.current, /50 点学校留堂惩罚/);

  const community = quests.find((q) => q.id === "community-service");
  assert.ok(community);
  assert.equal(community.status, "incomplete");
  assert.match(community.current, /3 次治安法庭判处/);

  const pillory = quests.find((q) => q.id === "pillory");
  assert.ok(pillory);
  assert.equal(pillory.status, "incomplete");

  const landry = quests.find((q) => q.id === "landrys-request");
  assert.ok(landry);
  assert.equal(landry.status, "completed");

  const remy = quests.find((q) => q.id === "sabotaging-remy");
  assert.ok(remy);
  assert.equal(remy.status, "completed");

  const exams = quests.find((q) => q.id === "school-exams");
  assert.ok(exams);
  assert.equal(exams.status, "completed");

  const trial = quests.find((q) => q.id === "trial-by-fire");
  assert.ok(trial);
  assert.equal(trial.status, "completed");

  const danubeJobs = quests.find((q) => q.id === "danube-jobs");
  assert.ok(danubeJobs);
  assert.equal(danubeJobs.status, "completed");

  const domusHunting = quests.find((q) => q.id === "domus-hunting");
  assert.ok(domusHunting);
  assert.equal(domusHunting.status, "completed");

  const ex = quests.find((q) => q.id === "exhibitionism");
  assert.ok(ex);
  assert.equal(ex.status, "completed");
});

test("成绩与金额浮点数按游戏原生机制自动向下取整保留整数", () => {
  const quests = analyzeQuests({
    variables: {
      science_exam: 1.2,
      maths_exam: 10.68,
      english_exam: 24.959999999999997,
      history_exam: 0.8999999999999999,
      rentday: 4,
      rentmoney: 400000,
      money: 13707491,
    },
  });

  const exams = quests.find((q) => q.id === "school-exams");
  assert.ok(exams);
  // 必须是与游戏原生属性面板一致的向下取整结果
  assert.match(exams.current, /科学 1 \/ 数学 10 \/ 英语 24 \/ 历史 0/);
  assert.doesNotMatch(exams.current, /\d+\.\d+/);
  assert.deepEqual(exams.evidence, [
    "科学成绩：1分",
    "数学成绩：10分",
    "英语成绩：24分",
    "历史成绩：0分",
  ]);

  const bailey = quests.find((q) => q.id === "bailey-payments");
  assert.ok(bailey);
  assert.match(bailey.current, /需交 £4000，当前持有现金 £137074/);
  assert.doesNotMatch(bailey.current, /£\d+\.\d+/);
});

test("中文 Wiki Navbox 54 篇任务页面实现 100% 零遗漏匹配", () => {
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

  assert.deepEqual(unhandled, [], "中文 Wiki 导航栏任务必须 100% 被小助手收录并覆盖");
});

test("英文 Wiki Navbox 49 篇任务与 Gwylan's Rituals 实现 100% 零遗漏收录", () => {
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

  assert.deepEqual(unhandled, [], "英文 Wiki 全部核心任务页面必须 100% 被小助手收录与支持");
});


