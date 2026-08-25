import {
  localizeAveryFate,
  localizeEscapeRoute,
  localizeMathsProjectState,
  localizePlayRole,
  localizeTempleRank,
  localizeWraithState,
  yesNo,
} from "./localization.js";

const STATUS = {
  INCOMPLETE: "incomplete",
  LOCKED: "locked",
  UNCERTAIN: "uncertain",
  COMPLETED: "completed",
  SEASONAL: "seasonal",
  ALTERNATE: "alternate",
  RECURRING: "recurring",
};

const WIKI_BASE = "https://degreesoflewditycn.miraheze.org/wiki/";

function hasFeat(variables, name) {
  const current = variables.feats?.currentSave;
  const all = variables.feats?.allSaves;
  return Boolean(
    (Array.isArray(current) ? current.includes(name) : current && Object.hasOwn(current, name)) ||
      (Array.isArray(all) ? all.includes(name) : all && Object.hasOwn(all, name)),
  );
}

function includes(list, value) {
  return Array.isArray(list) && list.includes(value);
}

function quest(definition, result) {
  const wikiTitle = definition.wikiTitle || definition.title;
  return {
    id: definition.id,
    title: definition.title,
    category: definition.category || "剧情任务",
    wikiTitle,
    wikiUrl: `${WIKI_BASE}${encodeURIComponent(wikiTitle)}`,
    status: result.status,
    current: result.current,
    next: result.next || [],
    evidence: result.evidence || [],
    note: result.note || "",
    progress: result.progress,
  };
}

function analyzeFarm(v) {
  const stage = Number(v.farm_stage || 0);
  const clearing = Number(v.farm?.clearing ?? 100);
  if (stage >= 12) {
    return {
      status: STATUS.COMPLETED,
      current: "农场建设阶段 12/12，最后一块田地已经恢复。",
      evidence: [`农场建设阶段：${stage}/12（存档字段：farm_stage）`, "已达到当前版本的最终建设阶段"],
    };
  }
  const next = [];
  if (stage < 2) next.push("在农场接受艾利克斯的工作");
  else if (clearing > 0) next.push(`继续清理当前田地，将剩余值 ${clearing} 降到 0`);
  else next.push("返回农场庭院，触发下一阶段事件");
  if (stage < 7) next.push("推进至阶段 7，解锁雷米的农场袭击");
  next.push("继续恢复田地，最终推进至阶段 12");
  return {
    status: stage >= 2 ? STATUS.INCOMPLETE : STATUS.LOCKED,
    current: `农场建设阶段 ${stage}/12；当前田地剩余清理值 ${clearing}。`,
    next,
    evidence: [`农场建设阶段：${stage}/12（存档字段：farm_stage）`, `当前田地剩余清理值：${clearing}（存档字段：farm.clearing）`],
    progress: { value: stage, max: 12, label: `${stage} / 12` },
  };
}

function analyzeLeightonBlackmail(v) {
  if (v.headblackmailed >= 1) {
    return {
      status: STATUS.COMPLETED,
      current: "已经使用礼顿电脑中的证据完成勒索路线。",
      evidence: [`勒索路线完成标记：已出现（存档字段：headblackmailed）`],
    };
  }
  if (v.headdrive >= 1) {
    return {
      status: STATUS.INCOMPLETE,
      current: "D 盘证据已经复制，但尚未完成最终处置。",
      next: ["将证据交给警方，或当面用证据勒索礼顿"],
      evidence: ["已复制 D 盘证据（存档字段：headdrive）", "尚未发现勒索路线完成标记（存档字段：headblackmailed）"],
    };
  }
  if (v.headpasswordknown >= 1) {
    return {
      status: STATUS.INCOMPLETE,
      current: "校长办公室密码已经取得，但 D 盘证据尚未复制。",
      next: ["潜入校长办公室", "登录礼顿的电脑并复制 D 盘", "选择报警或当面勒索"],
      evidence: ["已取得办公室密码（存档字段：headpasswordknown）", "尚未复制 D 盘证据（存档字段：headdrive）"],
    };
  }
  return {
    status: STATUS.LOCKED,
    current: "尚未获得校长办公室密码。",
    next: ["推进数学老师的信件事件，获取礼顿办公室密码"],
    evidence: ["尚未取得办公室密码（存档字段：headpasswordknown）"],
  };
}

function analyzeSchism(v) {
  const vision = Boolean(v.wraithPrison?.vision);
  if (vision || hasFeat(v, "Schism")) {
    return {
      status: STATUS.COMPLETED,
      current: "已经见证水下神殿的历史并完成“分裂”事件。",
      evidence: [vision ? "最终幻象：已完成（存档字段：wraithPrison.vision）" : "已获得“分裂”完成成就"],
    };
  }
  if (v.wraithPrison) {
    const time = Number(v.wraithPrison.timePassed || 0);
    const state = v.wraith?.state;
    const stateLabel = localizeWraithState(state);
    return {
      status: STATUS.INCOMPLETE,
      current: `象牙幽灵状态：${stateLabel}；水下监狱累计时间：${time} 分钟；最终幻象尚未完成。`,
      next: [
        "等待血月并进入湖中遗迹的水下监狱",
        "让创伤达到最大值约 40%，并使监狱累计时间达到至少 140 分钟",
        "进入幻象后继续观看，不要中途选择醒来",
      ],
      evidence: [
        `象牙幽灵状态：${stateLabel}（存档字段：wraith.state）`,
        `水下监狱累计时间：${time} 分钟（存档字段：wraithPrison.timePassed）`,
        "未发现最终幻象完成标记（存档字段：wraithPrison.vision）",
      ],
    };
  }
  return {
    status: STATUS.LOCKED,
    current: "尚未建立水下监狱的幽灵事件记录。",
    next: ["探索湖中遗迹，并推进象牙幽灵剧情"],
    evidence: ["尚未发现水下监狱事件记录（存档字段：wraithPrison）"],
  };
}

function analyzeTempleSpear(v) {
  const mission = v.temple_spear_mission;
  const grace = Number(v.grace || 0);
  const rank = v.temple_rank;
  const rankLabel = localizeTempleRank(rank);
  if (mission >= 2) {
    return {
      status: STATUS.COMPLETED,
      current: "圣矛朝圣任务已经向约旦汇报完成。",
      evidence: [`朝圣任务阶段：${mission}（存档字段：temple_spear_mission）`],
    };
  }
  if (mission === 1) {
    return {
      status: STATUS.INCOMPLETE,
      current: "圣矛朝圣任务进行中。",
      next: ["调查神秘岛屿的位置和航路", "取回圣矛", "返回神殿向约旦汇报"],
      evidence: ["朝圣任务阶段：进行中（存档字段：temple_spear_mission）"],
    };
  }
  if (["monk", "priest"].includes(rank) && grace >= 100) {
    return {
      status: STATUS.INCOMPLETE,
      current: "已满足接取条件，但尚未与约旦开始对话。",
      next: ["前往神殿与约旦对话，接受百年朝圣任务"],
      evidence: [`神殿身份：${rankLabel}（存档字段：temple_rank）`, `恩典：${grace}（存档字段：grace）`, "未发现朝圣任务记录（存档字段：temple_spear_mission）"],
    };
  }
  return {
    status: STATUS.LOCKED,
    current: `当前身份：${rankLabel}；恩典：${grace}/100。`,
    next: [
      ...(!["monk", "priest"].includes(rank) ? ["完成神殿晋升，达到修士身份"] : []),
      ...(grace < 100 ? [`通过神殿活动将恩典提高到 100（还差 ${100 - grace}）`] : []),
      "满足条件后与约旦对话",
    ],
    evidence: [`神殿身份：${rankLabel}（存档字段：temple_rank）`, `恩典：${grace}（存档字段：grace）`, "朝圣任务记录尚未出现"],
  };
}

function analyzeStimulant(v) {
  if (v.mathsstimcaught === 1) {
    return {
      status: STATUS.UNCERTAIN,
      current: "已被兴奋剂商贩盯上，但该变量不能区分“只失败过一次”和“已完成绑架”。",
      next: ["若确认已经看过完整绑架剧情，可在本助手中人工标记完成", "否则在下一次数学竞赛期间再次偷窃并故意失败"],
      evidence: ["已触发兴奋剂商贩追捕（存档字段：mathsstimcaught）", "游戏没有独立的绑架完成变量"],
    };
  }
  return {
    status: STATUS.LOCKED,
    current: "尚未进入兴奋剂商贩的追捕状态。",
    next: ["在数学竞赛期间找到兴奋剂商贩", "第一次偷窃失败后，再次失败以触发绑架"],
    evidence: ["尚未触发兴奋剂商贩追捕（存档字段：mathsstimcaught）"],
  };
}

function simpleCompleted({ done, doneText, pendingText, next, evidence }) {
  return done
    ? { status: STATUS.COMPLETED, current: doneText, evidence }
    : { status: STATUS.INCOMPLETE, current: pendingText, next, evidence };
}

export const QUEST_DEFINITIONS = [
  { id: "farm", title: "推进艾利克斯农场剧情", wikiTitle: "农场袭击", category: "主线推进", analyze: analyzeFarm },
  { id: "leighton-blackmail", title: "勒索礼顿", wikiTitle: "勒索礼顿", category: "主线推进", analyze: analyzeLeightonBlackmail },
  { id: "schism", title: "分裂", wikiTitle: "分裂", category: "主线推进", analyze: analyzeSchism },
  { id: "temple-spear", title: "神殿百年朝圣／圣矛任务", wikiTitle: "神殿", category: "当前版本任务", analyze: analyzeTempleSpear },
  { id: "stimulant-abduction", title: "因兴奋剂被绑架", wikiTitle: "因兴奋剂被绑架", category: "特殊事件", analyze: analyzeStimulant },
  {
    id: "cafe",
    title: "咖啡馆厨师晋升",
    wikiTitle: "咖啡馆活动",
    analyze: (v) => simpleCompleted({
      done: Number(v.chef_state || 0) >= 9,
      doneText: "厨师晋升线已经达到最终状态。",
      pendingText: `厨师晋升进度尚未完成（当前阶段：${v.chef_state ?? 0}）。`,
      next: ["继续在咖啡馆厨房工作并触发晋升"],
      evidence: [`厨师晋升阶段：${v.chef_state ?? 0}（存档字段：chef_state）`],
    }),
  },
  {
    id: "robin-debt",
    title: "罗宾债务剧情",
    wikiTitle: "罗宾的任务",
    analyze: (v) => simpleCompleted({
      done: v.robinpaid === 1 && v.robinmissing === 0,
      doneText: "罗宾的债务危机已经解决，罗宾当前未失踪。",
      pendingText: "罗宾的债务剧情尚未完整解决。",
      next: ["继续帮助罗宾支付债务并处理失踪事件"],
      evidence: [`罗宾债务已支付：${yesNo(v.robinpaid === 1)}（存档字段：robinpaid）`, `罗宾当前失踪：${yesNo(v.robinmissing === 1)}（存档字段：robinmissing）`],
    }),
  },
  {
    id: "flight",
    title: "学习飞行",
    wikiTitle: "学习飞行",
    analyze: (v) => simpleCompleted({
      done: v.birdFly === 1 && v.birdGlide === 1,
      doneText: "滑翔和飞行训练均已完成。",
      pendingText: "飞行训练尚未全部完成。",
      next: ["继续推进巨鹰塔的滑翔与飞行训练"],
      evidence: [`滑翔训练已完成：${yesNo(v.birdGlide === 1)}（存档字段：birdGlide）`, `飞行训练已完成：${yesNo(v.birdFly === 1)}（存档字段：birdFly）`],
    }),
  },
  {
    id: "temple-promotion",
    title: "神殿加入与晋升",
    wikiTitle: "神殿晋升",
    analyze: (v) => simpleCompleted({
      done: ["monk", "priest"].includes(v.temple_rank) || hasFeat(v, "Defy the Night"),
      doneText: `神殿晋升已经达到当前正常流程终点（${localizeTempleRank(v.temple_rank)}）。`,
      pendingText: `当前神殿身份：${localizeTempleRank(v.temple_rank)}。`,
      next: ["继续完成神殿试炼与晋升"],
      evidence: [`神殿身份：${localizeTempleRank(v.temple_rank)}（存档字段：temple_rank）`],
    }),
  },
  {
    id: "sydney-defilement",
    title: "悉尼亵渎仪式",
    wikiTitle: "亵渎仪式",
    analyze: (v) => simpleCompleted({
      done: includes(v.sydneySeen, "corruptroom"),
      doneText: "已经完成悉尼的亵渎仪式路线。",
      pendingText: "尚未发现亵渎仪式完成标记。",
      next: ["继续推进堕落悉尼的神殿仪式路线"],
      evidence: [includes(v.sydneySeen, "corruptroom") ? "已发现亵渎仪式完成记录（存档字段：sydneySeen）" : "未发现亵渎仪式完成记录（存档字段：sydneySeen）"],
    }),
  },
  {
    id: "doren-concern",
    title: "多伦的担忧",
    wikiTitle: "多伦的担忧",
    analyze: (v) => simpleCompleted({
      done: v.dorenhonest === 1 && includes(v.dorenSeen, "shower_ask"),
      doneText: "已经向多伦坦白并完成其担忧事件。",
      pendingText: "多伦的担忧事件尚未完整结束。",
      next: ["继续与多伦交流并处理淋浴相关事件"],
      evidence: [`已向多伦坦白：${yesNo(v.dorenhonest === 1)}（存档字段：dorenhonest）`, `已看过淋浴询问场景：${yesNo(includes(v.dorenSeen, "shower_ask"))}（存档字段：dorenSeen）`],
    }),
  },
  {
    id: "leighton-player-blackmail",
    title: "礼顿对玩家的勒索",
    wikiTitle: "礼顿的勒索",
    analyze: (v) => simpleCompleted({
      done: v.schoolfameconsensual === 1 || (v.schoolfameblackmail === 0 && v.schoolfameboard === 1),
      doneText: "礼顿的勒索线已经结束或转为自愿拍摄。",
      pendingText: "礼顿仍在利用学校名声进行勒索。",
      next: ["继续推进礼顿的拍摄与勒索事件"],
      evidence: [
        `强制拍摄状态：${v.schoolfameblackmail === 1 ? "进行中" : "已结束"}（存档字段：schoolfameblackmail）`,
        `自愿拍摄状态：${v.schoolfameconsensual === 1 ? "已启用" : "未启用"}（存档字段：schoolfameconsensual）`,
      ],
    }),
  },
  {
    id: "leighton-inspections",
    title: "礼顿的三次检查",
    wikiTitle: "礼顿的检查",
    analyze: (v) => {
      const scenes = v.scenePassages || [];
      const checks = [
        { marker: "Penis School Inspection", label: "阴茎检查" },
        { marker: "Pussy School Inspection", label: "阴道检查" },
        { marker: "Breast School Inspection", label: "胸部检查" },
      ];
      const seen = checks.filter((scene) => includes(scenes, scene.marker));
      return simpleCompleted({
        done: seen.length === checks.length,
        doneText: "三种学校检查场景均已完成。",
        pendingText: `已完成 ${seen.length}/3 种检查。`,
        next: ["按固定顺序继续触发尚未看过的检查"],
        evidence: checks.map((scene) => `${scene.label}：${seen.includes(scene) ? "已看过" : "未看过"}（存档字段：scenePassages）`),
      });
    },
  },
  {
    id: "kylar-abduction",
    title: "凯拉尔绑架剧情",
    wikiTitle: "凯拉尔的绑架",
    analyze: (v) => simpleCompleted({
      done: v.kylar_sleep_abduction === 1 || includes(v.scenePassages, "KylarAbduction"),
      doneText: "已经经历凯拉尔的睡眠绑架剧情。",
      pendingText: "尚未发现凯拉尔绑架完成标记。",
      next: ["继续提高凯拉尔关系并触发绑架剧情"],
      evidence: [`睡眠绑架完成标记：${v.kylar_sleep_abduction === 1 ? "已出现" : "未出现"}（存档字段：kylar_sleep_abduction）`],
    }),
  },
  {
    id: "maths-competition",
    title: "数学竞赛",
    wikiTitle: "数学竞赛",
    analyze: (v) => simpleCompleted({
      done: v.mathsproject === "won" || v.mathsprojectwon === 1,
      doneText: "已经赢得数学竞赛。",
      pendingText: `数学竞赛状态：${localizeMathsProjectState(v.mathsproject)}。`,
      next: ["完成数学项目并赢得竞赛"],
      evidence: [`数学项目状态：${localizeMathsProjectState(v.mathsproject)}（存档字段：mathsproject）`, `竞赛获胜标记：${v.mathsprojectwon === 1 ? "已出现" : "未出现"}（存档字段：mathsprojectwon）`],
    }),
  },
  {
    id: "science-fair",
    title: "科学展",
    wikiTitle: "科学博览会",
    analyze: (v) => simpleCompleted({
      done: hasFeat(v, "Science Fair Winner"),
      doneText: "已经赢得科学展。",
      pendingText: "尚未获得科学展优胜标记。",
      next: ["推进科学项目并赢得科学展"],
      evidence: [hasFeat(v, "Science Fair Winner") ? "已获得“科学博览会优胜者”完成标记" : "未获得“科学博览会优胜者”完成标记"],
    }),
  },
  {
    id: "english-play",
    title: "英语话剧",
    wikiTitle: "舞台剧",
    analyze: (v) => simpleCompleted({
      done: Boolean(v.englishPlayRolePlayed && v.englishPlayRolePlayed !== "none"),
      doneText: `已经出演英语话剧，角色为${localizePlayRole(v.englishPlayRolePlayed)}。`,
      pendingText: "尚未完成英语话剧演出。",
      next: ["继续英语课程并参加话剧演出"],
      evidence: [`出演角色：${localizePlayRole(v.englishPlayRolePlayed)}（存档字段：englishPlayRolePlayed）`],
    }),
  },
  {
    id: "moor-abduction",
    title: "荒原绑架／地下农场逃脱",
    wikiTitle: "在荒原被绑架",
    analyze: (v) => simpleCompleted({
      done: Boolean(v.livestock?.intro && v.livestock?.escape),
      doneText: `已经进入地下农场，并通过“${localizeEscapeRoute(v.livestock?.escape)}”路线离开。`,
      pendingText: "尚未发现地下农场逃脱记录。",
      next: ["在荒原触发绑架并从地下农场逃脱"],
      evidence: [`已进入地下农场：${yesNo(Boolean(v.livestock?.intro))}（存档字段：livestock.intro）`, `逃脱方式：${localizeEscapeRoute(v.livestock?.escape)}（存档字段：livestock.escape）`],
    }),
  },
  {
    id: "tenyclus",
    title: "街机游戏最终事件",
    wikiTitle: "Tenyclus",
    analyze: (v) => simpleCompleted({
      done: Number(v.tenyclusPlayCount || 0) >= 7,
      doneText: "已经连续游玩足够次数并触发街机游戏最终事件。",
      pendingText: `当前连续游玩次数：${v.tenyclusPlayCount || 0}/7。`,
      next: ["连续七天游玩街机游戏“泰尼克勒斯”"],
      evidence: [`连续游玩次数：${v.tenyclusPlayCount || 0}/7（存档字段：tenyclusPlayCount）`],
    }),
  },
  {
    id: "night-monster",
    title: "夜魔初始剧情",
    wikiTitle: "夜魔",
    analyze: (v) => simpleCompleted({
      done: Number(v.nightMonsterIntro || 0) >= 2,
      doneText: "夜魔初始剧情已经完成；后续遭遇可以重复。",
      pendingText: "夜魔初始剧情尚未完成。",
      next: ["继续夜间探索并完成夜魔初始事件"],
      evidence: [`夜魔初始事件阶段：${v.nightMonsterIntro || 0}/2（存档字段：nightMonsterIntro）`],
    }),
  },
  {
    id: "avery-tower",
    title: "艾弗里高塔剧情",
    wikiTitle: "艾弗里",
    analyze: (v) => simpleCompleted({
      done: Number(v.avery_tower?.progress || 0) >= 100 || hasFeat(v, "Pride Cometh"),
      doneText: `高塔剧情已经结束；艾弗里的结局状态为“${localizeAveryFate(v.avery_fate)}”。`,
      pendingText: `高塔进度：${v.avery_tower?.progress || 0}/100。`,
      next: ["继续艾弗里豪宅与高塔建设剧情"],
      evidence: [`高塔进度：${v.avery_tower?.progress || 0}/100（存档字段：avery_tower.progress）`, `结局状态：${localizeAveryFate(v.avery_fate)}（存档字段：avery_fate）`],
    }),
  },
  {
    id: "danube-ritual",
    title: "多瑙河街庄园地下仪式",
    wikiTitle: "多瑙河街",
    analyze: (v) => simpleCompleted({
      done: hasFeat(v, "Breaking the Stone"),
      doneText: "已经阻止多瑙河街庄园地下仪式。",
      pendingText: "尚未获得阻止地下仪式的完成标记。",
      next: ["继续调查多瑙河街庄园与神殿的关联"],
      evidence: [hasFeat(v, "Breaking the Stone") ? "已获得阻止地下仪式的完成标记" : "未获得阻止地下仪式的完成标记"],
    }),
  },
];

const SEASONAL_QUESTS = [
  { id: "halloween-robin", title: "罗宾万圣节任务", wikiTitle: "罗宾的万圣节", marker: null, markerLabel: null },
  { id: "halloween-eden", title: "伊甸万圣节任务", wikiTitle: "伊甸的万圣节", marker: null, markerLabel: null },
  { id: "halloween-whitney", title: "惠特尼万圣节场景", wikiTitle: "惠特尼的万圣节", marker: "halloweenwhitney", markerLabel: "惠特尼万圣节场景" },
  { id: "halloween-kylar", title: "凯拉尔万圣节场景", wikiTitle: "凯拉尔的万圣节", marker: "halloweenkylar", markerLabel: "凯拉尔万圣节场景" },
  { id: "valentine-robin", title: "罗宾情人节任务", wikiTitle: "节日", marker: null, markerLabel: null },
  { id: "valentine-eden", title: "伊甸情人节场景", wikiTitle: "伊甸的情人节", marker: "Eden Valentines Bath", markerLabel: "伊甸情人节沐浴场景" },
  { id: "christmas-robin", title: "罗宾圣诞节任务", wikiTitle: "罗宾的圣诞节", marker: null, markerLabel: null },
  { id: "christmas-eden", title: "伊甸圣诞节任务", wikiTitle: "伊甸的圣诞节", marker: null, markerLabel: null },
];

function seasonalQuests(v) {
  return SEASONAL_QUESTS.map((item) => {
    const confirmed = item.marker && includes(v.scenePassages, item.marker);
    return quest(
      { ...item, category: "季节任务" },
      confirmed
        ? {
            status: STATUS.COMPLETED,
            current: "存档的场景记录能够确认已经看过该事件。",
            evidence: [`已找到“${item.markerLabel}”观看记录（存档字段：scenePassages）`],
          }
        : {
            status: STATUS.SEASONAL,
            current: "没有可长期验证的完成标记；年度变量会在跨年时重置。",
            next: ["在对应节日期间重新检查或体验该任务"],
            evidence: [item.marker ? `未找到“${item.markerLabel}”观看记录（存档字段：scenePassages）` : "该事件没有可靠的永久完成变量"],
          },
    );
  });
}

function alternateQuests(v) {
  const defilementDone = includes(v.sydneySeen, "corruptroom");
  const averyResolved = Boolean(v.avery_fate);
  return [
    quest(
      { id: "sydney-promise", title: "悉尼承诺仪式", wikiTitle: "承诺仪式", category: "互斥路线" },
      {
        status: STATUS.ALTERNATE,
        current: defilementDone ? "亵渎仪式已经完成，因此承诺仪式在本存档中锁定。" : "这是与亵渎仪式互斥的路线。",
        evidence: [defilementDone ? "已找到亵渎仪式完成记录（存档字段：sydneySeen）" : "两条仪式路线互斥"],
      },
    ),
    quest(
      { id: "avery-fox-residue", title: "棕狐的奎恩手势任务", wikiTitle: "艾弗里", category: "互斥路线" },
      {
        status: STATUS.ALTERNATE,
        current: averyResolved
          ? "艾弗里高塔结局已经确定；残留任务记录不再出现在正式日志中。"
          : "该任务会影响尚未结束的高塔路线。",
        evidence: [`艾弗里结局状态：${localizeAveryFate(v.avery_fate)}（存档字段：avery_fate）`, `棕狐任务：${v.avery_mansion?.fox?.task === "Quinn" ? "奎恩" : "未出现"}（存档字段：fox.task）`],
      },
    ),
    quest(
      { id: "npc-exiles", title: "非玩家角色放逐路线", wikiTitle: "放逐NPC", category: "互斥路线" },
      {
        status: STATUS.ALTERNATE,
        current: "放逐属于破坏性替代结局，不计入正常任务缺口。",
        evidence: ["助手默认不把可选坏结局计入未完成任务"],
      },
    ),
  ];
}

function recurringQuests(v) {
  const stage = Number(v.farm_stage || 0);
  return [
    quest(
      { id: "farm-assault-repeat", title: "农场袭击（周期事件）", wikiTitle: "农场袭击", category: "重复事件" },
      {
        status: STATUS.RECURRING,
        current: stage >= 7 ? "已经解锁，会按周期再次发生。" : `农场阶段 ${stage}/12；达到阶段 7 后解锁。`,
        next: stage >= 7 ? ["按需要继续防守；不存在永久完成状态"] : ["先推进艾利克斯农场至阶段 7"],
        evidence: [`农场建设阶段：${stage}/12（存档字段：farm_stage）`],
      },
    ),
  ];
}

export function analyzeQuests(parsedSave, manualOverrides = {}) {
  const v = parsedSave.variables;
  const primary = QUEST_DEFINITIONS.map((definition) => quest(definition, definition.analyze(v)));
  const all = [...primary, ...seasonalQuests(v), ...alternateQuests(v), ...recurringQuests(v)];

  return all.map((item) => {
    if (!manualOverrides[item.id]) return item;
    return {
      ...item,
      status: STATUS.COMPLETED,
      current: "已由你人工确认完成。",
      manualConfirmed: true,
      evidence: [...item.evidence, "人工确认：已完成"],
    };
  });
}

export function getWikiTitles() {
  return [...new Set([...QUEST_DEFINITIONS, ...SEASONAL_QUESTS].map((item) => item.wikiTitle).filter(Boolean))];
}

export { STATUS };
