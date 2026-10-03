import {
  localizeAveryFate,
  localizeEscapeRoute,
  localizeMathsProjectState,
  localizePlayRole,
  localizeTempleRank,
  localizeWraithState,
  toEnglishWikiTitle,
  yesNo,
} from "./localization.js";
import { analyzeAsylumExploration } from "./asylum-quests.js";

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
const EN_WIKI_BASE = "https://degreesoflewdity.miraheze.org/wiki/";

function hasFeat(variables, name) {
  const current = variables.feats?.currentSave;
  return Boolean(Array.isArray(current) ? current.includes(name) : current && Object.hasOwn(current, name));
}

function includes(list, value) {
  return Array.isArray(list) && list.includes(value);
}

export function formatEvidence(evidenceList) {
  return (evidenceList || [])
    .map((item) =>
      String(item || "")
        .replace(/[（(]\s*存档字段[:：\s][^）)]*[）)]/g, "")
        .trim(),
    )
    .filter(Boolean);
}

function quest(definition, result) {
  const wikiTitle = definition.wikiTitle || definition.title;
  const enWikiTitle = definition.enWikiTitle || toEnglishWikiTitle(wikiTitle);
  return {
    id: definition.id,
    title: definition.title,
    category: definition.category || "剧情任务",
    wikiTitle,
    enWikiTitle,
    wikiUrl: `${WIKI_BASE}${encodeURIComponent(wikiTitle)}`,
    enWikiUrl: `${EN_WIKI_BASE}${encodeURIComponent(enWikiTitle)}`,
    status: result.status,
    current: result.current,
    next: result.next || [],
    evidence: formatEvidence(result.evidence),
    note: result.note || "",
    progress: result.progress,
  };
}

function analyzeFarm(v) {
  const stage = Math.floor(Number(v.farm_stage || 0));
  const clearing = Math.floor(Number(v.farm?.clearing));
  const hasClearing = v.farm?.clearing !== undefined && v.farm?.clearing !== null && Number.isFinite(clearing);
  const clearingLabel = hasClearing ? clearing : "未记录";
  if (!Number.isFinite(stage) || stage < 0) {
    return {
      status: STATUS.UNCERTAIN,
      current: "农场建设阶段记录无法识别。",
      next: ["查看游戏内日志中的农场建设状态"],
      evidence: ["农场建设阶段：无法识别（存档字段：farm_stage）"],
    };
  }
  if (stage >= 12) {
    return {
      status: STATUS.COMPLETED,
      current: "农场建设阶段 12/12，最后一块田地已经恢复。",
      evidence: [`农场建设阶段：${stage}/12（存档字段：farm_stage）`, "已达到当前版本的最终建设阶段"],
    };
  }
  const next = [];
  if (stage < 2) next.push("在农场接受艾利克斯的工作");
  else if (stage === 2) {
    const shift = Number(v.farm_shift);
    const ready = (hasClearing && clearing <= 50) || (Number.isFinite(shift) && shift >= 360);
    next.push(ready
      ? "继续农场工作，触发访客事件并推进下一阶段"
      : "将当前田地剩余清理值降到 50，或使本次班次累计工作达到 360 分钟，再继续农场工作");
  } else if (stage === 6) {
    const countdown = Number(v.farm_countdown);
    const ready = (hasClearing && clearing <= 50)
      || (v.farm_countdown !== undefined && v.farm_countdown !== null && Number.isFinite(countdown) && countdown <= 0);
    next.push(ready
      ? "继续农场工作，触发下一阶段事件"
      : "将当前田地剩余清理值降到 50，或等待农场事件倒计时结束，再继续农场工作");
  } else if (hasClearing && clearing <= 0) next.push("继续农场工作，触发下一阶段事件");
  else next.push(hasClearing
    ? `继续清理当前田地，将剩余值 ${clearing} 降到 0`
    : "查看农场工作页面，继续清理当前田地并推进阶段事件");
  if (stage < 7) next.push("推进至阶段 7，解锁雷米的农场袭击");
  next.push("继续恢复田地，最终推进至阶段 12");
  return {
    status: stage >= 2 ? STATUS.INCOMPLETE : STATUS.LOCKED,
    current: `农场建设阶段 ${stage}/12；当前田地剩余清理值 ${clearingLabel}。`,
    next,
    evidence: [`农场建设阶段：${stage}/12（存档字段：farm_stage）`, `当前田地剩余清理值：${clearingLabel}（存档字段：farm.clearing）`],
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
    const reported = v.headpolice === 1;
    return {
      status: STATUS.INCOMPLETE,
      current: reported
        ? "D 盘证据已经交给警方；尚未发现当面勒索礼顿的完成记录。"
        : "D 盘证据已经复制，但尚未完成勒索路线。",
      next: reported ? ["若要完成勒索路线，当面用证据勒索礼顿"] : ["当面用证据勒索礼顿；也可另行选择将证据交给警方"],
      evidence: [
        "已复制 D 盘证据（存档字段：headdrive）",
        ...(reported ? ["已将证据交给警方（存档字段：headpolice）"] : []),
        "尚未发现勒索路线完成标记（存档字段：headblackmailed）",
      ],
      note: "报警与勒索是不同结果；报警记录不等于勒索路线完成。",
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
  const vision = v.wraithPrison?.vision === true;
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
        "将象牙幽灵剧情推进到纠缠或绝望状态",
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
  if (Number.isFinite(Number(mission)) && mission >= 2) {
    return {
      status: STATUS.COMPLETED,
      current: "圣矛朝圣任务已经向约旦汇报完成。",
      evidence: [`朝圣任务阶段：${mission}（存档字段：temple_spear_mission）`],
    };
  }
  const vessel = v.spear_vessel;
  if (["held", "sea", "Zephyr"].includes(vessel)) {
    const held = vessel === "held";
    const location = held ? "已取得圣矛" : vessel === "sea" ? "圣矛已遗失在海中" : "圣矛已被海盗夺走";
    return {
      status: STATUS.INCOMPLETE,
      current: `${location}，尚未向约旦完成汇报。`,
      next: [held ? "返回神殿与约旦对话，交付圣矛" : `返回神殿向约旦报告${vessel === "sea" ? "圣矛在海中遗失" : "圣矛被海盗夺走"}`],
      evidence: [`圣矛去向：${location}（存档字段：spear_vessel）`, "尚未发现汇报完成标记（存档字段：temple_spear_mission）"],
      note: "已经持有圣矛时可直接向约旦交付，不必先满足接取朝圣委托的晋升与恩典条件。",
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

function analyzeBaileyPayments(v) {
  const rentTime = Math.floor(Number(v.renttime));
  const hasRentTime = v.renttime !== undefined && v.renttime !== null && Number.isFinite(rentTime);
  const rentMoney = Number(v.rentmoney || 0);
  const babyRent = Number(v.babyRent || 0);
  const totalRent = rentMoney + babyRent;
  const currentMoney = Number(v.money || 0);
  const rentPounds = Math.floor(totalRent / 100);
  const currentPounds = Math.floor(currentMoney / 100);
  const evidence = [
    `距离交租剩余：${hasRentTime ? `${rentTime} 天` : "未记录"}（存档字段：renttime）`,
    `本轮需付总额：£${rentPounds}（存档字段：rentmoney + babyRent）`,
    ...(babyRent > 0 ? [`其中子女照料附加费用：£${Math.floor(babyRent / 100)}（存档字段：babyRent）`] : []),
    `当前现金：£${currentPounds}（存档字段：money）`,
  ];
  // time.js 的 inRentPausedBadEnd 只认最后一条尚未结束的追踪记录。
  const lastBadEnd = Array.isArray(v.badEndStats) ? v.badEndStats.at(-1) : null;
  const pausedLocations = {
    Prison: "监狱",
    Asylum: "精神病院",
    "Underground Farm": "地下农场",
    "Underground Dungeon": "地下地牢",
  };
  const paused = Number.isFinite(lastBadEnd?.trackedStart)
    && lastBadEnd.trackedEnd === undefined
    && Object.hasOwn(pausedLocations, lastBadEnd.source);
  if (paused) {
    return {
      status: STATUS.RECURRING,
      current: `当前处于${pausedLocations[lastBadEnd.source]}停留期间，租金倒计时暂停；本轮记录的需付总额为 £${rentPounds}。`,
      next: ["先推进当前地点的事件；离开后再查看租金安排"],
      evidence: [...evidence, "租金倒计时：暂停（存档字段：badEndStats）"],
      note: "游戏在这类尚未结束的停留期间暂停租金倒计时，离开后恢复正常周期。",
    };
  }
  if (!hasRentTime) {
    return {
      status: v.rentmoney === undefined ? STATUS.LOCKED : STATUS.UNCERTAIN,
      current: "存档没有记录租金倒计时，无法判断距离交租还有几天。",
      next: ["查看游戏内日志或贝利的租金安排"],
      evidence,
    };
  }

  if (rentTime <= 0) {
    const affordable = currentMoney >= totalRent;
    const shortPounds = Math.ceil((totalRent - currentMoney) / 100);
    const due = rentTime < 0 ? `交租已逾期 ${Math.abs(rentTime)} 天` : "交租已经到期";
    return {
      status: STATUS.INCOMPLETE,
      current: affordable
        ? `${due}，持有现金充足（现有 £${currentPounds} / 需付 £${rentPounds}），请交给贝利。`
        : `${due}，持有现金不足（现有 £${currentPounds} / 需付 £${rentPounds}，缺少 £${shortPounds}），请尽快筹款！`,
      next: affordable
        ? ["前往孤儿院将周租交付给贝利"]
        : ["通过探险、打工或变卖物品筹集周租，避免被送入感化院或遭暴力对待"],
      evidence,
    };
  }

  const shortPounds = Math.ceil((totalRent - currentMoney) / 100);
  return {
    status: STATUS.RECURRING,
    current: `距离下次交租还剩 ${rentTime} 天；本轮需交 £${rentPounds}，当前持有现金 £${currentPounds}。`,
    next: currentMoney >= totalRent
      ? ["资金已备齐，等待交租日前往孤儿院交付"]
      : [`还差 £${shortPounds}，可通过打工或探险筹款`],
    evidence,
  };
}

function analyzeSchoolProjects(v) {
  // 获奖旗标跨学年保留，不能替代本学年的项目状态。
  const scienceDone = ["done", "won"].includes(v.scienceproject);
  const mathsPendingEnd = v.mathsproject === "done" && v.mathsprojectdays !== undefined;
  const mathsDone = v.mathsproject === "won" || (v.mathsproject === "done" && !mathsPendingEnd);
  const englishMissed = v.englishPlay === "missed";
  const englishDone = v.englishPlay === "done" || englishMissed;
  const projects = [
    { name: "科学博览会项目", state: v.scienceproject, done: scienceDone, field: "scienceproject" },
    { name: "数学竞赛作业", state: v.mathsproject, done: mathsDone, field: "mathsproject" },
    { name: "英语话剧活动", state: v.englishPlay, done: englishDone, field: "englishPlay" },
  ];
  const completed = projects.filter((project) => project.done).length;
  const knownStates = ["none", "ongoing", "done", "won", "missed"];
  const unknown = projects.some((project) => !knownStates.includes(project.state));
  const pending = projects.filter((project) => !project.done);
  const labels = projects.map((project) => {
    const state = project.name === "英语话剧活动" && englishMissed ? "本年已错过，窗口已关闭"
      : project.name === "数学竞赛作业" && mathsPendingEnd ? "已进入比赛，尚未结束"
        : project.done ? "本年已结束"
          : project.state === "ongoing" ? "本年进行中"
            : project.state === "none" ? "本年尚未触发" : "本年状态未记录或无法识别";
    return `${project.name}：${state}（存档字段：${project.field}）`;
  });
  return {
    status: completed === 3 ? STATUS.COMPLETED : unknown ? STATUS.UNCERTAIN : STATUS.INCOMPLETE,
    current: completed === 3
      ? `本学年学校三类项目均已结束。${englishMissed ? "英语话剧本年已错过。" : ""}`
      : `本学年学校项目已结束 ${completed}/3；待确认或推进：${pending.map((project) => project.name).join("、")}。${englishMissed ? "英语话剧本年已错过。" : ""}`,
    next: [
      ...pending.map((project) => project.state === "none"
        ? `在对应学年日期上课，等待${project.name}启动`
        : knownStates.includes(project.state) ? `继续推进${project.name}直到结尾` : `查看游戏日志确认${project.name}的本年状态`),
      ...(englishMissed || completed === 3 ? ["等待下一学年重新参加已结束或错过的项目"] : []),
    ],
    evidence: [
      ...labels,
      ...(v.scienceprojectwon === 1 ? ["曾获得科学博览会奖项；不代表本年项目已结束（存档字段：scienceprojectwon）"] : []),
      ...(v.mathsprojectwon === 1 ? ["曾获得数学竞赛奖项；不代表本年项目已结束（存档字段：mathsprojectwon）"] : []),
    ],
    progress: { value: completed, max: 3, label: `${completed} / 3` },
    note: "此条目统计本学年项目是否已经结束，包括超期关闭；结束不保证实际参加或获奖。历史获奖记录不会替代本年状态。",
  };
}

const REQUEST_FISH_NAMES = {
  haddock: "黑线鳕",
  salmon: "鲑鱼",
  trout: "鳟鱼",
  bass: "鲈鱼",
  perch: "河鲈",
  cod: "鳕鱼",
  pike: "狗鱼",
  eel: "鳗鱼",
};

function analyzeFishingRequest(v) {
  const request = v.daily?.fishing?.baitShopRequest;
  const fishKey = v.daily?.fishing?.baitShopRequestFish;
  const fish = REQUEST_FISH_NAMES[fishKey] || "店主指定的鲜鱼";
  const total = Math.max(0, Math.floor(Number(v.fishing?.baitShopRequestsCompleted || 0)));
  const evidence = [`累计交付鲜鱼委托：${total} 次（存档字段：fishing.baitShopRequestsCompleted）`];
  const note = "这是每日限时委托；累计交付次数不代表今天的委托已经完成。";

  if (request === "delivered") {
    return {
      status: STATUS.COMPLETED,
      current: `今天的鲜鱼委托已经交付；累计完成 ${total} 次。`,
      next: ["以后可在鱼饵店营业时再次询问每日鲜鱼委托"],
      evidence: [...evidence, "今日委托：已交付（存档字段：daily.fishing.baitShopRequest）"],
      note,
    };
  }
  if (request === "requested" || request === "ready") {
    const ready = request === "ready";
    return {
      status: STATUS.INCOMPLETE,
      current: ready ? `已钓到${fish}，还没有交给鱼饵店店主。` : `已接受委托，需要今天新钓到一条${fish}。`,
      next: ready
        ? ["当天 19:00 关店前，把鱼交给梅尔街栈桥鱼饵店的店主"]
        : ["用鱼竿钓到店主指定的鱼；市场购买的鱼不满足当天新鲜捕获要求", "当天 19:00 关店前返回梅尔街栈桥鱼饵店交付"],
      evidence: [...evidence, `今日委托：${ready ? "已钓到，待交付" : "已接取，待钓获"}（存档字段：daily.fishing.baitShopRequest）`],
      note: REQUEST_FISH_NAMES[fishKey] ? note : `${note} 鱼种未收录，请以游戏内委托要求为准。`,
    };
  }
  if (request === "willRequest") {
    return {
      status: STATUS.INCOMPLETE,
      current: "鱼饵店今天有鲜鱼委托，尚未接受。",
      next: ["在鱼饵店营业时询问；常规委托须在 13:00 前接取，并在当天 19:00 关店前交付"],
      evidence: [...evidence, "今日委托：等待接取（存档字段：daily.fishing.baitShopRequest）"],
      note,
    };
  }
  if (request && request !== "notToday") {
    return {
      status: STATUS.UNCERTAIN,
      current: "今日鲜鱼委托状态未收录，请查看游戏内的鱼饵店或日志。",
      next: ["以游戏内委托状态为准"],
      evidence,
      note,
    };
  }
  return {
    status: v.fishing ? STATUS.RECURRING : STATUS.LOCKED,
    current: request === "notToday"
      ? "今天没有可接取的鲜鱼委托；以后仍可再次询问。"
      : "尚未发现今天已经接取的鲜鱼委托。",
    next: ["前往梅尔街栈桥购买鱼竿，并在鱼饵店营业时询问鲜鱼委托"],
    evidence,
    note,
  };
}

function analyzeWrenHeist(v) {
  const done = includes(v.wrenSeen, "heist");
  const accepted = v.wrenHeist === true;
  const attended = v.wrenHeistDance?.attended === true;
  const missed = v.wrenHeistMissed === true;
  const cooldown = Math.max(0, Math.floor(Number(v.wrenHeistMonthly || 0)));
  const currentRound = accepted
    ? attended ? "本轮已赴约；赴约记录本身不能确认本轮结尾已经结束。" : "本轮已接受邀请，尚未赴约。"
    : missed ? "最近一次邀请已爽约。" : cooldown > 0 ? `当前邀请冷却还剩 ${cooldown} 天。` : "当前没有已接受的舞会邀请。";
  const next = accepted
    ? attended ? ["继续舞会事件，直到离开庄园并观看伦恩的分赃结尾"] : ["邀请当天 19:00 至 21:00 前往多瑙河街庄园与伦恩会合；入场时需衣着得体"]
    : missed ? ["再见到伦恩时处理爽约对话，等待后续邀请"]
      : cooldown > 0 ? ["等待邀请冷却结束后，再去酒吧找兰德里"]
        : ["结识伦恩，并在满足犯罪记录、社交声望或监狱相关条件后，于 18:00 前去酒吧找兰德里"];
  return {
    status: done ? STATUS.COMPLETED : accepted ? STATUS.INCOMPLETE : missed || cooldown > 0 ? STATUS.RECURRING : STATUS.LOCKED,
    current: `${done ? "已经至少结束过一次伦恩舞会劫案；该剧情可重复。" : "尚未发现舞会劫案的结尾记录。"} ${currentRound}`,
    next,
    evidence: [
      `舞会劫案结尾记录：${done ? "已出现" : "未出现"}（存档字段：wrenSeen）`,
      `本轮邀请：${accepted ? "已接受" : "未接受"}（存档字段：wrenHeist）`,
      `本轮赴约记录：${attended ? "已出现" : "未出现"}（存档字段：wrenHeistDance.attended）`,
    ],
    note: "完成状态只表示至少体验过一次劫案结尾；接受邀请、赴约、爽约和冷却都不单独算完成。",
  };
}

function analyzeSmugglers(v) {
  const known = v.smuggler_known === 1;
  const timer = Number(v.smuggler_timer);
  const hasTimer = v.smuggler_timer !== undefined && v.smuggler_timer !== null && Number.isFinite(timer);
  const locations = { forest: "森林", sewer: "旧下水道", beach: "沙滩附近的礁石", bus: "公交站" };
  const location = locations[v.smuggler_location];
  const stolen = Math.max(0, Math.floor(Number(v.smuggler_stolen_stat || 0)));
  const evidence = [
    `本轮行动线索：${known ? "已获知" : "未获知"}（存档字段：smuggler_known）`,
    ...(hasTimer && known ? [`本轮行动倒计时：${timer} 天（存档字段：smuggler_timer）`] : []),
    ...(Number.isFinite(stolen) && stolen > 0 ? [`历史抢夺次数：${stolen} 次；不表示本轮线索已获知（存档字段：smuggler_stolen_stat）`] : []),
  ];
  const note = "这是周期行动；隐藏的地点排程和历史抢夺次数都不能证明玩家已获知本轮线索。";
  if (hasTimer && timer < 0) {
    return {
      status: STATUS.RECURRING,
      current: "本轮走私行动已经结束，等待下一轮情报。",
      next: ["以后在脱衣舞俱乐部调酒时偷听走私谈话，重新获得下一轮线索"],
      evidence,
      note,
    };
  }
  if (known && hasTimer && location) {
    return {
      status: STATUS.INCOMPLETE,
      current: timer > 0
        ? `已获知本轮走私线索：${timer} 天后经由${location}进入城镇。`
        : `本轮走私行动就在今晚午夜前，地点是${location}。`,
      next: timer > 0 ? [`等待 ${timer} 天，于行动当晚午夜前前往${location}`] : [`今晚午夜前前往${location}，寻找走私行动`],
      evidence: [...evidence, `本轮行动地点：${location}（存档字段：smuggler_location）`],
      note,
    };
  }
  if (known) {
    return {
      status: STATUS.UNCERTAIN,
      current: "已获知走私线索，但行动日期或地点记录无法识别。",
      next: ["查看游戏日志，按其中的行动时间和地点推进"],
      evidence,
      note,
    };
  }
  return {
    status: STATUS.LOCKED,
    current: "尚未获知本轮走私行动的时间与地点。",
    next: ["在脱衣舞俱乐部调酒时成功偷听走私谈话，获得本轮线索"],
    evidence,
    note,
  };
}

function analyzeDocksInfiltration(v) {
  const hasCurrentGrid = Boolean(v.skul_dock && typeof v.skul_dock === "object");
  return {
    status: STATUS.UNCERTAIN,
    current: hasCurrentGrid
      ? "存档保留了当前码头区域信息，无法据此确认过去是否完成过潜入。"
      : "游戏没有独立的码头潜入历史完成标记，无法自动判断是否完成过。",
    next: ["确认已经完成过码头潜入后，可在助手中人工标记完成", "需要继续探索时，在夜间前往码头寻找潜入机会"],
    evidence: [hasCurrentGrid ? "当前码头区域记录：已出现（存档字段：skul_dock）" : "没有可用于确认历史完成的记录"],
    note: "区域信息在普通访问码头时也会建立，并会刷新；它不表示潜入的永久完成状态。",
  };
}

function analyzePoliceInfiltration(v) {
  const intro = Number(v.police_intro || 0);
  const hack = Number(v.police_hack || 0);
  const operations = Math.floor(Number(v.police_delete || 0));
  if (operations >= 1) {
    return {
      status: STATUS.COMPLETED,
      current: `当前记录中已在警局电脑成功执行 ${operations} 次档案操作。`,
      next: ["如需继续处理案底，确认可用密码后再次潜入警局"],
      evidence: [`成功档案操作记录：${operations} 次（存档字段：police_delete）`],
      note: "成功操作不代表所有案底已清零；潜入被抓后，这个操作记录可能重置。",
    };
  }
  if (hack >= 1) {
    const stage = hack === 1 ? "已发现警局电脑的登录障碍，需要黑客或盗贼帮助。"
      : hack === 2 ? "已向兰德里寻求帮助，黑客委托尚未完成。"
        : hack === 4 ? "尚未取得当前可用的警局密码，需要向兰德里更新密码。"
          : hack === 5 ? "已取得警局密码，尚无成功执行档案操作的记录。"
            : "警局渗透线正在推进，尚无成功执行档案操作的记录。";
    return {
      status: STATUS.INCOMPLETE,
      current: stage,
      next: hack === 5
        ? ["夜间潜入倒钩街警察局，登录后办公室的电脑并选择档案操作"]
        : hack === 2 ? ["完成兰德里与黑客相关的委托，取得警局密码"]
          : ["前往酒吧找兰德里，询问如何取得当前可用的警局密码"],
      evidence: ["尚无成功档案操作记录（存档字段：police_delete）"],
    };
  }
  if (intro >= 1) {
    return {
      status: STATUS.INCOMPLETE,
      current: "本次已发现警局后办公室，尚无成功执行档案操作的记录。",
      next: ["查看后办公室的电脑，遇到登录障碍后向兰德里寻求帮助"],
      evidence: ["本次后办公室探索记录：已出现（存档字段：police_intro）"],
    };
  }
  return {
    status: STATUS.LOCKED,
    current: "尚未发现警局电脑的访问或成功操作记录。",
    next: ["前往倒钩街警察局，夜间寻找后办公室的潜入机会"],
    evidence: ["当前无警局电脑访问记录（存档字段：police_hack / police_intro）"],
  };
}

function analyzeChastityVow(v) {
  const rank = v.temple_rank;
  const isMember = ["initiate", "monk", "priest"].includes(rank);
  const vow = v.player?.virginity?.temple;

  if (!isMember) {
    return {
      status: STATUS.LOCKED,
      current: `尚未加入神殿，无法接受贞洁誓言（当前身份：${localizeTempleRank(rank)}）。`,
      next: ["前往狼街神殿完成入教仪式"],
      evidence: [`神殿身份：${localizeTempleRank(rank)}（存档字段：temple_rank）`],
    };
  }
  const missing = vow === undefined || vow === null;
  return {
    status: vow === true ? STATUS.COMPLETED : missing ? STATUS.UNCERTAIN : STATUS.INCOMPLETE,
    current: vow === true
      ? "已是神殿成员，当前仍在遵守神殿贞洁誓言。"
      : missing ? "已是神殿成员，但存档没有可识别的当前誓言记录。"
        : "已是神殿成员，当前记录显示神殿贞洁誓言已被打破。",
    next: vow === true ? ["继续遵守誓言并提升神殿声望"]
      : missing ? ["查看神殿忏悔对话，确认当前誓言状态"]
        : ["返回神殿忏悔，并按神殿要求恢复誓言"],
    evidence: [
      `神殿身份：${localizeTempleRank(rank)}（存档字段：temple_rank）`,
      `当前誓言：${vow === true ? "遵守中" : missing ? "未记录" : "已打破"}（存档字段：player.virginity.temple）`,
    ],
    note: "完成状态表示当前仍遵守誓言；是否佩戴装置、装置名称及来源都不能替代誓言记录。",
  };
}

function analyzeCharlieJobs(v) {
  const job = v.weekly?.danceJob;
  const jobs = { docks: "梅尔街学生派对", party: "宅邸街派对", stage: "多瑙河街高级派对" };
  if (job === "done") {
    return {
      status: STATUS.COMPLETED,
      current: "查理本周的工作已经结束；下周还会有新的委托。",
      next: ["下周前往倒钩街舞蹈室向查理询问新的工作"],
      evidence: ["本周工作：已结束（存档字段：weekly.danceJob）"],
      note: "这是每周重复的工作，完成状态只对应本周结束，不表示工作永久完成或演出成功。",
    };
  }
  if (v.danceStudio?.job) {
    return {
      status: STATUS.INCOMPLETE,
      current: `查理本周的${jobs[job] || "派对演出"}工作正在进行。`,
      next: ["继续当前派对演出，直到本周工作结束"],
      evidence: ["本周工作：进行中（存档字段：danceStudio.job）"],
    };
  }
  if (v.danceStudio?.jobOffered || Object.hasOwn(jobs, job)) {
    return {
      status: STATUS.RECURRING,
      current: Object.hasOwn(jobs, job)
        ? `查理本周可以安排${jobs[job]}工作，尚未开始演出。`
        : "已解锁查理的每周工作，可以询问本周安排。",
      next: ["前往倒钩街舞蹈室与查理交谈"],
      evidence: ["每周工作：已解锁（存档字段：danceStudio.jobOffered / weekly.danceJob）"],
    };
  }
  return {
    status: STATUS.LOCKED,
    current: "尚未从查理处获得工作委托。",
    next: ["前往倒钩街舞蹈室上课，提升舞蹈技能后向查理询问工作"],
    evidence: ["每周工作：尚未解锁（存档字段：danceStudio.jobOffered）"],
  };
}

function analyzeDanubeBurglary(v) {
  return {
    status: STATUS.RECURRING,
    current: "多瑙河街入室盗窃是可重复的夜间活动；当前记录无法确认是否曾完成。",
    next: ["夜间在多瑙河街接近民宅；开锁需要有效诡术至少 300，且双手未被绑", "是否满足当下条件以游戏选项为准；确认曾完成时可人工标记"],
    evidence: Number.isFinite(v.skulduggery) ? [`基础诡术：${Math.floor(v.skulduggery)}`] : [],
    note: "基础技能不包含游戏的有效值修正；该路线没有独立的永久完成计数。",
  };
}

function analyzeGwylansRituals(v) {
  const met = Boolean(v.forest_shop_intro || v.gwylan_rescue || v.gwylan_cafe_intro || v.gwylan_hunt_intro);
  const experienced = includes(v.gwylanSeen, "ritual_beast") || includes(v.gwylanSeen, "ritual_sex");
  const now = Number.isFinite(v.startDate) && Number.isFinite(v.timeStamp) ? v.startDate + v.timeStamp : null;
  const request = v.gwylan?.request;
  if (v.beastRitual || v.sexRitual) {
    return {
      status: STATUS.INCOMPLETE,
      current: "格威兰的仪式正在进行，本轮尚未结束。",
      next: ["继续当前仪式，按照游戏中的步骤推进至结尾"],
      evidence: [v.sexRitual ? "当前有仪式过程记录" : "当前有森林仪式过程记录", experienced ? "此前已有仪式体验记录" : "尚无可识别的仪式结尾记录"],
    };
  }
  if (request?.event) {
    const requests = {
      meetAtShop: "到森林商店见面", meetAtCafe: "在 7:20–9:20 到咖啡馆见面", yearning: "到森林商店见面",
      clothing: "穿着指定衣物到森林商店", ingredients: "收集指定材料", sample: "收集指定样本", recipe: "收集配方所需物品",
      samplePlayer: "提供指定样本", preen: "协助整理羽翼", cream: "确认奶油相关提议", robin: "确认罗宾相关委托", chastity: "处理贞洁装置委托",
    };
    const expired = now !== null && Number.isFinite(request.timer) && request.timer > 0 && request.timer < now;
    return {
      status: expired || !Object.hasOwn(requests, request.event) ? STATUS.UNCERTAIN : STATUS.INCOMPLETE,
      current: expired
        ? "仍有格威兰委托记录，但委托时限已过，结果需要在游戏中确认。"
        : `格威兰当前委托：${requests[request.event] || "未识别的委托类型"}；委托记录不代表仪式完成。`,
      next: ["查看游戏日志中的具体物品和时限，再向格威兰确认或交付委托"],
      evidence: ["当前有格威兰委托记录", experienced ? "此前已有仪式体验记录" : "尚无可识别的仪式结尾记录"],
    };
  }
  if (experienced) {
    const timer = v.gwylan?.timer?.ritual;
    const days = now !== null && Number.isFinite(timer) ? Math.max(0, Math.floor(timer / 86400) - Math.floor(now / 86400)) : null;
    return {
      status: STATUS.RECURRING,
      current: days > 0 ? `已体验过格威兰的仪式；距下一轮仪式的冷却结束还有 ${days} 天。` : "已体验过格威兰的仪式；后续仪式仍可重复。",
      next: [days > 0 ? "等待冷却结束后再拜访森林商店" : "到森林商店向格威兰确认下一轮仪式的条件"],
      evidence: [includes(v.gwylanSeen, "ritual_beast") ? "已有森林仪式结尾记录" : "已有净化仪式结尾记录"],
      note: "完成历史不代表本轮已完成或全部仪式已解锁；净化效果取决于实际仪式结果。",
    };
  }
  if (met) {
    return {
      status: STATUS.RECURRING,
      current: "已结识格威兰，但没有可识别的仪式结尾记录。",
      next: ["拜访森林商店，继续格威兰的委托并询问仪式条件"],
      evidence: [v.forest_shop_intro ? "已在森林商店见面" : "已有格威兰见面或救援记录"],
      note: "见面和商店解锁不能用于确认仪式完成。",
    };
  }
  return {
    status: STATUS.LOCKED,
    current: "没有可识别的格威兰见面记录。",
    next: ["在森林商店、咖啡馆或森林相关事件中结识格威兰"],
    evidence: ["角色初始化对象本身不代表已见面或完成仪式"],
  };
}

function analyzeTrialByFire(v) {
  const rank = v.temple_rank;
  const isMember = ["initiate", "monk", "priest"].includes(rank);
  if (isMember || v.weekly?.templeFire) {
    return {
      status: STATUS.UNCERTAIN,
      current: v.weekly?.templeFire ? "本周已开始过火的考验，但记录不能确认是否通过。" : "已加入神殿，但身份不能确认是否通过火的考验。",
      next: [v.weekly?.templeFire ? "继续当前流程或等待下周重试；确认已经通过时可人工标记完成" : "向神殿询问火的考验；确认已经通过时可人工标记完成"],
      evidence: [isMember ? `当前神殿身份：${localizeTempleRank(rank)}` : "当前神殿身份不能确认", ...(v.weekly?.templeFire ? ["本周已有尝试记录"] : [])],
      note: "纯洁入教和通过火考都会授予入教身份；本周尝试标志在开始时写入，失败也会保留。",
    };
  }
  return {
    status: STATUS.INCOMPLETE,
    current: "目前没有可识别的入教身份或本周火考尝试记录，历史结果无法确认。",
    next: ["前往狼街神殿向约旦询问入教考核与火的考验"],
    evidence: ["当前没有可识别的火考成功记录"],
  };
}

function analyzeSchoolExams(v) {
  const subjects = [["science", "科学"], ["maths", "数学"], ["english", "英语"], ["history", "历史"]];
  const grades = { [-1]: "F", 0: "D", 1: "C", 2: "B", 3: "A", 4: "A*" };
  const marks = subjects.map(([key, label]) => {
    const trait = v[`${key}trait`];
    return `${label} ${Number.isInteger(trait) && Object.hasOwn(grades, trait) ? grades[trait] : "未知"}`;
  });
  const known = subjects.every(([key]) => Number.isInteger(v[`${key}trait`]) && Object.hasOwn(grades, v[`${key}trait`]));
  return {
    status: known ? STATUS.RECURRING : STATUS.UNCERTAIN,
    current: `每周学校考试是重复活动；当前学科评级：${marks.join(" / ")}。`,
    next: ["通过听课和温习提升理解度，在每周五的相应课程中参加考试"],
    evidence: subjects.map(([key], index) => `${marks[index]}；基础理解度：${Number.isFinite(v[`${key}_exam`]) ? Math.floor(v[`${key}_exam`]) : "未知"}`),
    note: "理解度影响基础提升概率，并非考试成绩；考试成功后理解度会归零，当前评级也不能证明本周已通过。",
  };
}

function analyzeDetention(v) {
  if (!Number.isFinite(v.detention)) {
    return { status: STATUS.UNCERTAIN, current: "当前留堂积压记录无法确认。", next: ["查看游戏日志中的留堂提示"], evidence: [] };
  }
  const detention = Math.floor(v.detention);
  if (detention > 0) {
    return {
      status: STATUS.INCOMPLETE,
      current: `当前累计有 ${detention} 点学校留堂惩罚尚未服满。`,
      next: [v.daily?.school?.detentionAttended === 1 ? "今天已有留堂出席记录；继续当前处罚流程，后续查看游戏日志" : "上课日放学后前往留堂教室接受处罚"],
      evidence: [`积压留堂点数：${detention}点（存档字段：detention）`],
    };
  }
  return {
    status: STATUS.COMPLETED,
    current: "当前没有积压的学校留堂惩罚。",
    evidence: ["当前留堂积压点数：0点（存档字段：detention）"],
    note: "零积压不代表操行良好或当前处罚场景已经结束；游戏在进入留堂时就会清除积压。",
  };
}

function analyzeCommunityService(v) {
  if (v.community_service !== undefined && !Number.isFinite(v.community_service)) {
    return { status: STATUS.UNCERTAIN, current: "当前社区服务剩余天数无法确认。", next: ["查看游戏日志中的社区服务提示"], evidence: [] };
  }
  const service = Math.floor(v.community_service || 0);
  if (service > 0) {
    const paused = ["asylum", "prison"].includes(v.location) || Boolean(v.daily?.asylumPrison);
    const doneToday = v.community_service_done === 1;
    return {
      status: STATUS.INCOMPLETE,
      current: `尚有 ${service} 天社区服务等待履行。${paused ? "禁闭期间履行要求暂停。" : doneToday ? "今天已履行，无需再次接取。" : "今天尚未履行。"}`,
      next: paused ? ["禁闭解除后再按游戏日志继续履行"] : doneToday ? ["下一天再查看剩余服务要求"] : ["在 6:00–21:00（不含 21:00）前往倒钩街警局接取当天服务；需满足游戏的着装要求"],
      evidence: [`剩余社区服务天数：${service}天`, ...(doneToday ? ["今日已有履行记录"] : []), ...(paused ? ["当前处于履行要求暂停的禁闭状态"] : [])],
      note: "剩余天数在当天服务开始时递减；今日履行标记不能证明当前服务场景已经结束。",
    };
  }
  return {
    status: STATUS.COMPLETED,
    current: "当前无待履行的社区治安劳役令。",
    evidence: ["当前无社区服务记录（存档字段：community_service）"],
    note: "这里只表示没有剩余天数，不用于确认历史服务或当前服务场景结束。",
  };
}

function analyzePillory(v) {
  const audience = v.pillory?.audience;
  if (Number.isFinite(audience) && audience > 0) {
    return {
      status: STATUS.INCOMPLETE,
      current: "当前正被锁在悬崖街颈手枷示众服刑中。",
      next: ["忍耐示众受辱直至刑期结束，或等待同伴协助解救"],
      evidence: ["当前受刑状态：颈手枷公开示众处刑中（存档字段：pillory）"],
    };
  }
  if (!v.pillory || typeof v.pillory !== "object" || !Number.isFinite(audience)) {
    return { status: STATUS.UNCERTAIN, current: "当前玩家的颈手枷服刑状态无法确认。", next: ["查看当前游戏场景；确认曾完成时可人工标记"], evidence: [] };
  }
  return {
    status: STATUS.RECURRING,
    current: "当前没有玩家处于颈手枷示众中的活动记录。",
    evidence: ["玩家示众活动记录未激活"],
    note: "枷锁常驻对象、NPC 受刑者和保留的时间记录都不能证明玩家正在受刑；此状态不代表历史刑期完成。",
  };
}

function analyzeLandrysRequest(v) {
  const destinations = { forest: "森林深处", moor: "荒原", sewers: "旧下水道" };
  if (v.pubtask2 === 1) {
    return {
      status: STATUS.INCOMPLETE,
      current: "已找到兰德里的黑匣子，尚待回酒吧交付。",
      next: ["返回酒吧找兰德里，将黑匣子交给他"],
      evidence: ["黑匣子：已取得（存档字段：pubtask2）"],
    };
  }
  if (Object.hasOwn(destinations, v.pubtask)) {
    return {
      status: STATUS.INCOMPLETE,
      current: `正在进行兰德里的黑匣子委托；目标地点是${destinations[v.pubtask]}。`,
      next: [`前往${destinations[v.pubtask]}寻找遗失的黑匣子`, "取得后回酒吧交给兰德里"],
      evidence: [`当前委托地点：${destinations[v.pubtask]}（存档字段：pubtask）`],
    };
  }
  return {
    status: STATUS.UNCERTAIN,
    current: "目前没有可识别的黑匣子委托记录；无法判断是未接取，还是已经交付。",
    next: ["如果确认已经交付过黑匣子，可在助手中人工标记完成", "需要继续委托时，前往酒吧找兰德里询问"],
    evidence: ["当前没有可识别的黑匣子收取或目的地记录"],
    note: "交付后游戏会清除当前委托记录；其他酒吧委托的累计次数不能用于确认黑匣子完成。",
  };
}

function analyzeLockerRaid(v) {
  const stolen = Number.isFinite(v.stat_panties_stolen) ? Math.floor(v.stat_panties_stolen) : null;
  const suspicion = Number.isFinite(v.locker_suspicion) ? Math.floor(v.locker_suspicion) : null;
  if (stolen > 0) {
    return {
      status: STATUS.RECURRING,
      current: `已有从学校锁柜偷取内衣的记录（累计：${stolen} 件）；该活动可以重复。`,
      next: ["在学校更衣室寻找可开启的锁柜，留意嫌疑度与被发现的风险"],
      evidence: [
        `累计偷取内衣：${stolen} 件`,
        ...(suspicion !== null ? [`更衣室嫌疑度：${suspicion}`] : []),
      ],
      note: "统计的是偷取内衣数量，不是开启柜子的次数，也不表示柜子已永久清空。",
    };
  }
  return {
    status: stolen === 0 ? STATUS.RECURRING : STATUS.UNCERTAIN,
    current: stolen === 0 ? "当前没有偷取学校锁柜内衣的累计记录；是否曾只开柜未拿物品无法确认。" : "偷取学校锁柜内衣的累计记录无法确认。",
    next: ["提升撬锁技能并在学校泳池更衣室寻找可下手的目标锁柜"],
    evidence: stolen === 0 ? ["累计偷取内衣：0 件"] : [],
  };
}

function analyzeDanubeJobs(v) {
  if (v.danube_housekeeping === 1) {
    return {
      status: STATUS.RECURRING,
      current: "已通过多瑙河街家政试工，获得可重复的工作机会。",
      next: ["白天到多瑙河街敲门寻找家政工作"],
      evidence: ["家政工作资格已解锁"],
      note: "资格标志不是完成次数，也不证明今天已经工作。",
    };
  }
  return {
    status: STATUS.LOCKED,
    current: "尚未在多瑙河街豪宅区开启家政工作委托。",
    next: ["白天前往多瑙河街敲门参加试工；成功试工需要家政技能至少 300"],
    evidence: Number.isFinite(v.housekeeping) ? [`家政技能：${Math.floor(v.housekeeping)}`] : [],
  };
}

function analyzeSabotagingRemy(v) {
  const farmStage = Math.floor(Number(v.farm_stage || 0));
  if (farmStage < 5) {
    return {
      status: STATUS.LOCKED,
      current: `艾利克斯农田建设未达防守阶段（当前：${farmStage}/12），尚未解锁破坏行动。`,
      next: ["继续建设艾利克斯农场，阶段 5 起关注日志中的雷米庄园线索"],
      evidence: [`农场建设阶段：${farmStage}/12（存档字段：farm_stage）`],
    };
  }
  const actions = [];
  if (v.estate?.vials === "shattered") actions.push("打碎药瓶");
  for (const [key, label] of [["steeds", "惊扰马匹"], ["weapons", "藏匿武器"], ["cars", "使车辆失灵"], ["fire", "纵火"]]) {
    if (v.estate?.cards?.[key] === 1) actions.push(label);
  }
  if (actions.length > 0) {
    return {
      status: STATUS.COMPLETED,
      current: `本次庄园访问已有实际破坏记录：${actions.join("、")}。`,
      next: ["结束本次访问后继续协助艾利克斯防守；日后仍可再次行动"],
      evidence: actions.map((action) => `本次已实施：${action}`),
      note: "这只确认本次实际行动；离开庄园会清除本次记录，不能据此追踪永久完成历史。",
    };
  }
  return {
    status: v.estate ? STATUS.INCOMPLETE : STATUS.UNCERTAIN,
    current: v.estate ? "本次庄园访问尚无可识别的削弱袭击破坏记录。" : "雷米庄园的破坏线索已出现；当前没有本次行动记录，历史结果无法确认。",
    next: ["查看日志中的庄园线索，寻找进入路线并实施实际破坏", "如果确认此前已实施破坏，可人工标记历史完成"],
    evidence: [`农场建设阶段：${farmStage}/12`, ...(v.estate_fence ? ["已有庄园通路线索；通路不代表实施破坏"] : [])],
    note: "访问结束标记、进门路线、只放牛或农场威胁值低都不能用于确认实施过破坏。",
  };
}

function analyzeDomusBurglary(v) {
  return {
    status: STATUS.RECURRING,
    current: "宅邸街入室盗窃是可重复的夜间活动；当前记录无法确认是否曾完成。",
    next: ["夜间在宅邸街接近民宅；开锁需要有效诡术至少 100，且双手未被绑", "是否满足当下条件以游戏选项为准；确认曾完成时可人工标记"],
    evidence: Number.isFinite(v.skulduggery) ? [`基础诡术：${Math.floor(v.skulduggery)}`] : [],
    note: "基础技能不包含游戏的有效值修正；该路线没有独立的永久完成计数。",
  };
}

function analyzeDomusJobs(v) {
  return {
    status: STATUS.RECURRING,
    current: "宅邸街日间提供可重复的住户工作；当前记录无法确认全区工作历史。",
    next: ["日间到宅邸街敲门询问住户需求；具体工作以当次选项为准"],
    evidence: [],
    note: "游戏没有全区工作的统一完成次数；阁楼工作标记和收入不能证明其他工作完成。",
  };
}

function analyzeDomusHunting(v) {
  const isDemon = Math.floor(Number(v.demon || 0)) >= 6;
  if (!isDemon) {
    return {
      status: STATUS.LOCKED,
      current: "非恶魔形态无法在宅邸街夜间窗台进行狩猎。",
      next: ["在森林或仪式中转化堕落为恶魔形态"],
      evidence: ["当前非恶魔形态（存档字段：demon < 6）"],
    };
  }
  return {
    status: STATUS.RECURRING,
    current: "已达到恶魔形态门槛；夜间狩猎还要求有效淫乱值至少 15，历史完成无法确认。",
    next: ["夜间在宅邸街查看窗口选项；有效淫乱值包含醉酒和发情修正，是否可用以游戏为准"],
    evidence: ["恶魔形态已达门槛", ...(Number.isFinite(v.promiscuity) ? [`基础淫乱值：${Math.floor(v.promiscuity)}`] : [])],
    note: "恶魔形态本身不保证当前能够狩猎；当天孤儿窗口事件也不能代表整条活动完成。",
  };
}

function analyzeExhibitionism(v) {
  const run = v.exhibitionismrun;
  const stage = v.exhibitionismrunon;
  const skill = Number.isFinite(v.exhibitionism) ? Math.floor(v.exhibitionism) : null;
  const evidence = skill !== null ? [`基础暴露技能：${skill}/100`] : [];
  const stages = { 0: "多瑙河街的脱衣挑战", 1: "多瑙河街的第二次挑战", 2: "星鱼街挑战", 3: "悬崖挑战" };
  const validRun = (run === "danube" && [0, 1].includes(stage)) || (run === "starfish" && stage === 2) || (run === "cliff" && stage === 3);
  if (run) {
    return {
      status: validRun ? STATUS.INCOMPLETE : STATUS.UNCERTAIN,
      current: validRun ? `已接受${stages[stage]}；本段尚待执行。` : "当前有暴露挑战委托，但地点与阶段组合无法识别。",
      next: ["按游戏日志的地点、时间和具体要求完成本段挑战"],
      evidence: [...evidence, "当前有尚未清除的挑战委托"],
      progress: validRun ? { value: stage, max: 4, label: `${stage} / 4 段已推进` } : undefined,
      note: "技能水平不能用于确认挑战完成；最终挑战结束后游戏会清除委托和阶段记录。",
    };
  }
  if ([1, 2, 3].includes(stage)) {
    return {
      status: STATUS.INCOMPLETE,
      current: `暴露挑战已推进 ${stage}/4 段，目前等待下一段邀请。`,
      next: ["留意后续的神秘纸条；接到邀请后按日志推进下一段"],
      evidence: [...evidence, `保留的后续邀请阶段：${stage}`],
      progress: { value: stage, max: 4, label: `${stage} / 4 段已推进` },
    };
  }
  return {
    status: STATUS.UNCERTAIN,
    current: "目前没有可识别的暴露挑战委托；无法区分尚未开始和已经完成整条挑战。",
    next: ["留意街头神秘纸条；确认完成过全部四段时可人工标记"],
    evidence,
    note: "最终结尾会清除委托与阶段；暴露技能和可复用等待计时不能证明历史完成。",
  };
}

function simpleCompleted({ done, doneText, pendingText, next, evidence }) {
  return done
    ? { status: STATUS.COMPLETED, current: doneText, evidence }
    : { status: STATUS.INCOMPLETE, current: pendingText, next, evidence };
}

export const QUEST_DEFINITIONS = [
  { id: "bailey-payments", title: "贝利周常租金", wikiTitle: "贝利的付款", enWikiTitle: "Bailey's Payments", category: "生存机制", analyze: analyzeBaileyPayments },
  { id: "school-projects", title: "学校学术项目", wikiTitle: "学校项目", enWikiTitle: "School Projects", category: "学业推进", analyze: analyzeSchoolProjects },
  { id: "school-exams", title: "学校学期与周考", wikiTitle: "学校考试", enWikiTitle: "School Exams", category: "学业推进", analyze: analyzeSchoolExams },
  { id: "detention", title: "学校留堂惩罚", wikiTitle: "留堂", enWikiTitle: "Detention", category: "学校纪律", analyze: analyzeDetention },
  { id: "community-service", title: "法庭社区劳役", wikiTitle: "社会服务", enWikiTitle: "Community Service", category: "治安管教", analyze: analyzeCommunityService },
  { id: "pillory", title: "颈手枷公开示众", wikiTitle: "颈手枷", enWikiTitle: "Pillory", category: "治安管教", analyze: analyzePillory },
  { id: "smugglers", title: "走私者集团调查", wikiTitle: "走私者", enWikiTitle: "Smugglers", category: "剧情探索", analyze: analyzeSmugglers },
  { id: "fishing-request", title: "鱼饵店每日鲜鱼委托", wikiTitle: "钓鱼", enWikiTitle: "Fishing", category: "每日委托", analyze: analyzeFishingRequest },
  { id: "wren-heist", title: "伦恩舞会劫案", wikiTitle: "伦恩", enWikiTitle: "Wren", category: "剧情探索", analyze: analyzeWrenHeist },
  { id: "asylum-exploration", title: "精神病院禁区探索", wikiTitle: "精神病院", enWikiTitle: "Asylum", analyze: analyzeAsylumExploration },
  { id: "landrys-request", title: "兰德里的黑匣子委托", wikiTitle: "兰德里的请求", enWikiTitle: "Landry's Request", category: "剧情探索", analyze: analyzeLandrysRequest },
  { id: "docks-infiltration", title: "商业码头潜入", wikiTitle: "潜入码头", enWikiTitle: "Docks Infiltration", category: "夜间潜入", analyze: analyzeDocksInfiltration },
  { id: "police-infiltration", title: "警察局秘密潜入", wikiTitle: "渗透警局", enWikiTitle: "Police Infiltration", category: "夜间潜入", analyze: analyzePoliceInfiltration },
  { id: "locker-raid", title: "洗劫更衣室锁柜", wikiTitle: "洗劫锁柜", enWikiTitle: "Locker Raid", category: "校园偷窃", analyze: analyzeLockerRaid },
  { id: "chastity-vow", title: "神殿贞洁誓言", wikiTitle: "贞洁誓言", enWikiTitle: "Chastity Vow", category: "神殿日常", analyze: analyzeChastityVow },
  { id: "trial-by-fire", title: "神殿火的考验", wikiTitle: "神殿", enWikiTitle: "Trial by Fire", category: "神殿晋升", analyze: analyzeTrialByFire },
  { id: "gwylans-rituals", title: "格威兰的仪式与商店", wikiTitle: "格威兰的仪式", enWikiTitle: "Gwylan's Rituals", category: "特殊服务", analyze: analyzeGwylansRituals },
  { id: "charlie-jobs", title: "查理的委托工作", wikiTitle: "查理的工作", enWikiTitle: "Charlie's Jobs", category: "兼职打工", analyze: analyzeCharlieJobs },
  { id: "danube-jobs", title: "多瑙河街家政兼职", wikiTitle: "在多瑙河街寻找工作", enWikiTitle: "Danube Street Jobs", category: "兼职打工", analyze: analyzeDanubeJobs },
  { id: "danube-burglary", title: "多瑙河街入室盗窃", wikiTitle: "在多瑙河街入室盗窃", enWikiTitle: "Danube Street Burglary", category: "犯罪路线", analyze: analyzeDanubeBurglary },
  { id: "domus-jobs", title: "宅邸街家政打工", wikiTitle: "在宅邸街寻找工作", enWikiTitle: "Domus Street Jobs", category: "兼职打工", analyze: analyzeDomusJobs },
  { id: "domus-burglary", title: "宅邸街入室盗窃", wikiTitle: "在宅邸街入室盗窃", enWikiTitle: "Domus Street Burglary", category: "犯罪路线", analyze: analyzeDomusBurglary },
  { id: "domus-hunting", title: "宅邸街恶魔夜间狩猎", wikiTitle: "在宅邸街夜间狩猎", enWikiTitle: "Domus Street Night Hunting", category: "特殊机制", analyze: analyzeDomusHunting },
  { id: "sabotaging-remy", title: "破坏雷米农场反击", wikiTitle: "破坏雷米农场", enWikiTitle: "Sabotaging Remy", category: "农场战线", analyze: analyzeSabotagingRemy },
  { id: "exhibitionism", title: "暴露癖挑战机制", wikiTitle: "暴露任务", enWikiTitle: "Exhibitionism", category: "特殊机制", analyze: analyzeExhibitionism },
  { id: "farm", title: "推进艾利克斯农场剧情", wikiTitle: "农场袭击", category: "主线推进", analyze: analyzeFarm },
  { id: "leighton-blackmail", title: "勒索礼顿", wikiTitle: "勒索礼顿", category: "主线推进", analyze: analyzeLeightonBlackmail },
  { id: "schism", title: "分裂", wikiTitle: "分裂", category: "主线推进", analyze: analyzeSchism },
  { id: "temple-spear", title: "神殿百年朝圣／圣矛任务", wikiTitle: "神殿", category: "当前版本任务", analyze: analyzeTempleSpear },
  { id: "stimulant-abduction", title: "因兴奋剂被绑架", wikiTitle: "因兴奋剂被绑架", category: "特殊事件", analyze: analyzeStimulant },
  {
    id: "cafe",
    title: "咖啡馆厨师晋升",
    wikiTitle: "咖啡馆活动",
    analyze: (v) => {
      const stage = Number(v.chef_state || 0);
      const opened = Number(v.bun_value || 0) >= 10000;
      return {
        status: opened ? STATUS.COMPLETED : stage >= 1 ? STATUS.INCOMPLETE : STATUS.LOCKED,
        current: opened ? "已经完成咖啡馆开幕，开幕结果标记已出现。" : stage >= 9 ? "已进入咖啡馆开幕阶段，尚未发现开幕结束的结果标记。" : `厨师晋升阶段：${stage}。`,
        next: opened ? [] : [stage >= 9 ? "继续完成咖啡馆开幕事件" : "在咖啡馆厨房工作并推进晋升"],
        evidence: [`厨师晋升阶段：${stage}（存档字段：chef_state）`, `开幕结果标记：${opened ? "已出现" : "未发现"}（存档字段：bun_value）`],
      };
    },
  },
  {
    id: "robin-debt",
    title: "罗宾债务剧情",
    wikiTitle: "罗宾的任务",
    analyze: (v) => simpleCompleted({
      done: v.robinpaid === 1 && v.robinmissing === 0,
      doneText: "本轮罗宾债务已支付，罗宾当前未失踪；后续仍可能出现新一轮债务。",
      pendingText: "本轮罗宾债务或当前失踪事件仍需处理。",
      next: ["继续帮助罗宾支付债务并处理失踪事件"],
      evidence: [`罗宾债务已支付：${yesNo(v.robinpaid === 1)}（存档字段：robinpaid）`, `罗宾当前失踪：${v.robinmissing === 0 ? "否" : ({ docks: "商业码头", landfill: "垃圾填埋场", dinner: "晚餐事件", pillory: "颈手枷", mansion: "庄园" })[v.robinmissing] || (v.robinmissing ? "有失踪记录，去向待确认" : "记录缺失，待确认")}（存档字段：robinmissing）`],
    }),
  },
  {
    id: "flight",
    title: "学习飞行",
    wikiTitle: "学习飞行",
    analyze: (v) => {
      const done = hasFeat(v, "Catch the Wind");
      const started = v.birdFly === 1 || v.birdGlide === 1;
      return {
        status: done ? STATUS.COMPLETED : started ? STATUS.UNCERTAIN : STATUS.INCOMPLETE,
        current: done ? "本存档已取得飞行成功成就。" : started ? "滑翔或飞行训练已开始；开始标记不能确认最终飞行是否成功。" : "当前没有可确认飞行成功的记录。",
        next: done ? [] : ["继续巨鹰塔训练；若已成功飞行但没有成就，可人工确认"],
        evidence: [`滑翔训练已开始：${yesNo(v.birdGlide === 1)}（存档字段：birdGlide）`, `飞行训练已开始：${yesNo(v.birdFly === 1)}（存档字段：birdFly）`, `本存档飞行成功成就：${yesNo(done)}`],
      };
    },
  },
  {
    id: "temple-promotion",
    title: "神殿加入与晋升",
    wikiTitle: "神殿晋升",
    analyze: (v) => simpleCompleted({
      done: ["monk", "priest"].includes(v.temple_rank) || hasFeat(v, "Defy the Night"),
      doneText: ["monk", "priest"].includes(v.temple_rank) ? `当前神殿身份已晋升为${localizeTempleRank(v.temple_rank)}。` : "本存档保留晋升成就；当前神殿身份可能已改变。",
      pendingText: `当前神殿身份：${localizeTempleRank(v.temple_rank)}。`,
      next: ["继续完成神殿试炼与晋升"],
      evidence: [`当前神殿身份：${localizeTempleRank(v.temple_rank)}（存档字段：temple_rank）`, `本存档晋升成就：${yesNo(hasFeat(v, "Defy the Night"))}`],
    }),
  },
  {
    id: "sydney-defilement",
    title: "悉尼亵渎仪式",
    wikiTitle: "亵渎仪式",
    analyze: (v) => simpleCompleted({
      done: includes(v.sydneySeen, "corruptroom"),
      doneText: "本存档已完成悉尼亵渎仪式的主体，后续离场对话不由该记录确认。",
      pendingText: "当前没有可确认亵渎仪式主体完成的记录。",
      next: ["继续推进堕落悉尼的神殿仪式路线"],
      evidence: [includes(v.sydneySeen, "corruptroom") ? "已发现亵渎仪式完成记录（存档字段：sydneySeen）" : "未发现亵渎仪式完成记录（存档字段：sydneySeen）"],
    }),
  },
  {
    id: "doren-concern",
    title: "多伦的担忧",
    wikiTitle: "多伦的担忧",
    analyze: (v) => ({
      status: v.dorenintro === 1 ? STATUS.UNCERTAIN : v.dorenhonest === 1 ? STATUS.INCOMPLETE : STATUS.LOCKED,
      current: v.dorenintro === 1 ? "已开始拜访多伦；记录不能区分初访正在进行还是已经结束。" : v.dorenhonest === 1 ? "已向多伦坦白，可以继续拜访。" : "当前没有坦白或初访记录。",
      next: v.dorenintro === 1 ? ["若已结束初访，可人工确认；共浴询问是可选对话"] : ["在英语课事件中向多伦坦白，再推进初访"],
      evidence: [`已向多伦坦白：${yesNo(v.dorenhonest === 1)}（存档字段：dorenhonest）`, `初访已开始：${yesNo(v.dorenintro === 1)}（存档字段：dorenintro）`],
    }),
  },
  {
    id: "leighton-player-blackmail",
    title: "礼顿对玩家的勒索",
    wikiTitle: "礼顿的勒索",
    analyze: (v) => {
      const voluntary = v.schoolfameconsensual === 1;
      const stopped = v.headphotoshoot === 1 && !voluntary;
      const started = Number.isFinite(v.schoolfameblackmail) || v.schoolfameboard === 1;
      return {
        status: stopped || voluntary ? STATUS.COMPLETED : started ? STATUS.RECURRING : STATUS.LOCKED,
        current: voluntary ? "拍摄已转为自愿路线；这是路线改变，拍摄仍可继续。" : stopped ? "已出现礼顿停止拍摄的记录。" : started ? "尚无停止拍摄记录；拍摄计时归零只代表本日拍摄后的冷却。" : "当前没有启动勒索拍摄的记录。",
        next: stopped || voluntary ? [] : started ? ["按当前路线应对周期拍摄，或推进停止拍摄的分支"] : ["继续学校剧情，按自己的选择处理拍摄邀请"],
        evidence: [`停止拍摄记录：${yesNo(stopped)}（存档字段：headphotoshoot、schoolfameconsensual）`, `拍摄间隔计时：${Number.isFinite(v.schoolfameblackmail) ? v.schoolfameblackmail : "无记录"}（存档字段：schoolfameblackmail）`, `自愿拍摄：${yesNo(voluntary)}（存档字段：schoolfameconsensual）`],
      };
    },
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
      return {
        status: seen.length === checks.length || Number(v.schoolevent || 0) >= 3 ? STATUS.UNCERTAIN : STATUS.INCOMPLETE,
        current: `已解锁 ${seen.length}/3 种检查回放；解锁记录在检查介绍时生成，不能确认已看完。`,
        next: ["继续当前检查流程；若三次检查均已结束，可人工确认"],
        evidence: [`检查触发阶段：${v.schoolevent ?? "无记录"}（存档字段：schoolevent）`, ...checks.map((scene) => `${scene.label}回放：${seen.includes(scene) ? "已解锁" : "未发现解锁记录"}（存档字段：scenePassages）`)],
      };
    },
  },
  {
    id: "kylar-abduction",
    title: "凯拉尔绑架剧情",
    wikiTitle: "凯拉尔的绑架",
    analyze: (v) => {
      const endings = ["kylarAbductionReleased", "kylarAbductionRescued", "kylarAbductionLeave", "kylarStockholmRefused", "kylarStockholm"];
      const left = Array.isArray(v.badEndStats) && v.badEndStats.some((record) => record?.source === "Kylar Abduction" && Number.isFinite(record.trackedEnd) && endings.includes(record.reasonEnd));
      const sleep = v.kylar_sleep_abduction === 1 || includes(v.scenePassages, "KylarManorSleep");
      const stockholm = v.syndromekylar === 1 || includes(v.scenePassages, "KylarAbduction");
      return {
        status: left ? STATUS.COMPLETED : STATUS.UNCERTAIN,
        current: left ? "本存档保留至少一次普通绑架结束并离开的明确记录。" : sleep ? "睡眠绑架已开始，但没有独立结尾标记。" : stockholm ? "普通绑架的斯德哥尔摩分支已触发；这不是睡眠绑架完成记录。" : "当前没有可确认凯拉尔绑架已结束的记录，旧存档也可能缺少历史。",
        next: left ? [] : ["若正在绑架中，继续当前分支；已经离开且没有结束记录时可人工确认"],
        evidence: [`普通绑架结束记录：${yesNo(left)}（存档字段：badEndStats）`, `睡眠绑架开始记录：${yesNo(sleep)}（存档字段：kylar_sleep_abduction、scenePassages）`, `斯德哥尔摩分支记录：${yesNo(stockholm)}（存档字段：syndromekylar、scenePassages）`],
        note: "普通绑架结束记录只确认至少一次经历；睡眠绑架及其他结局不会由它一并确认。",
      };
    },
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
      done: v.scienceproject === "won" || v.scienceprojectwon === 1 || hasFeat(v, "Science Fair Winner"),
      doneText: "已经赢得科学展。",
      pendingText: "当前没有可确认科学展获胜的记录；缺少成就不等于从未参赛。",
      next: ["推进科学项目并赢得科学展"],
      evidence: [`本存档获胜记录：${yesNo(v.scienceproject === "won" || v.scienceprojectwon === 1)}（存档字段：scienceproject、scienceprojectwon）`, `本存档科学展成就：${yesNo(hasFeat(v, "Science Fair Winner"))}`],
    }),
  },
  {
    id: "english-play",
    title: "英语话剧",
    wikiTitle: "舞台剧",
    analyze: (v) => {
      const role = Boolean(v.englishPlayRolePlayed && v.englishPlayRolePlayed !== "none");
      const done = v.englishPlay === "done" && role;
      const missed = v.englishPlay === "missed";
      return {
        status: done ? STATUS.COMPLETED : missed ? STATUS.LOCKED : role ? STATUS.UNCERTAIN : STATUS.INCOMPLETE,
        current: done ? `本学年话剧已结束，出演角色为${localizePlayRole(v.englishPlayRolePlayed)}。` : missed ? "本学年的话剧已错过；角色记录只保留报名角色，不能证明出演。" : role ? "保留了历史角色记录，但当前学年状态不能确认已出演。" : "当前没有可确认话剧演出结束的记录。",
        next: done ? [] : missed ? ["等待下一学年话剧开放"] : role ? ["核对当前学年话剧状态；已出演且记录缺失时可人工确认"] : ["继续英语课程并参加本学年的话剧"],
        evidence: [`当前学年话剧状态：${({ none: "尚未开始", ongoing: "进行中", done: "已结束", missed: "已错过" })[v.englishPlay] || "无可识别记录"}（存档字段：englishPlay）`, `保留角色：${localizePlayRole(v.englishPlayRolePlayed)}（存档字段：englishPlayRolePlayed）`],
      };
    },
  },
  {
    id: "moor-abduction",
    title: "荒原绑架／地下农场逃脱",
    wikiTitle: "在荒原被绑架",
    analyze: (v) => {
      const endings = ["uFarmEscapedNightRiver", "uFarmEscapedNightRiverFrozen", "uFarmEscapedNightHole", "uFarmEscapedFamiliar", "uFarmEscapedCentaurThank", "uFarmEscapedCentaurKiss", "uFarmEscapedHorse"];
      const escaped = Array.isArray(v.badEndStats) && v.badEndStats.some((record) => record?.source === "Underground Farm" && Number.isFinite(record.trackedEnd) && endings.includes(record.reasonEnd));
      return {
        status: escaped ? STATUS.COMPLETED : v.livestock?.escape ? STATUS.INCOMPLETE : STATUS.UNCERTAIN,
        current: escaped ? "本存档保留至少一次成功离开地下农场的明确记录。" : v.livestock?.escape ? "已开始逃跑，但当前逃跑路线仍可能遭到追捕，不能确认成功离开。" : "当前没有可确认成功逃脱的历史记录；旧存档可能缺少结束记录。",
        next: escaped ? [] : [v.livestock?.escape ? "完成追捕或援救后的离开流程" : "若已经成功逃脱且旧存档没有记录，可人工确认"],
        evidence: [`成功逃脱历史：${yesNo(escaped)}（存档字段：badEndStats）`, `地下农场经历标记：${yesNo(Boolean(v.livestock?.intro))}（存档字段：livestock.intro）`, `当前逃跑路线：${localizeEscapeRoute(v.livestock?.escape)}（存档字段：livestock.escape）`],
      };
    },
  },
  {
    id: "tenyclus",
    title: "街机游戏最终事件",
    wikiTitle: "Tenyclus",
    analyze: (v) => ({
      status: Number(v.tenyclusPlayCount || 0) >= 7 ? STATUS.UNCERTAIN : STATUS.INCOMPLETE,
      current: Number(v.tenyclusPlayCount || 0) >= 7 ? "累计游玩门槛已达到，最终事件链已触发；计数不能确认最终结尾。" : `累计游玩进度：${v.tenyclusPlayCount || 0}/7，无须连续每天游玩。`,
      next: Number(v.tenyclusPlayCount || 0) >= 7 ? ["完成街机最终事件；已经结束时可人工确认"] : ["在不同日期累计游玩；关闭触手时第六次会直接达到门槛"],
      evidence: [`累计游玩进度：${v.tenyclusPlayCount || 0}/7（存档字段：tenyclusPlayCount）`],
    }),
  },
  {
    id: "night-monster",
    title: "夜魔初始剧情",
    wikiTitle: "夜魔",
    analyze: (v) => ({
      status: Number(v.nightMonsterIntro || 0) >= 2 ? STATUS.UNCERTAIN : STATUS.INCOMPLETE,
      current: Number(v.nightMonsterIntro || 0) >= 2 ? "夜魔的第二次初始遭遇已触发；阶段值不能确认末尾已经结束。" : "继续推进夜魔初始遭遇。",
      next: ["完成当前初始事件；若第二次遭遇已结束，可人工确认"],
      evidence: [`夜魔初始事件阶段：${v.nightMonsterIntro || 0}/2（存档字段：nightMonsterIntro）`],
    }),
  },
  {
    id: "avery-tower",
    title: "艾弗里高塔剧情",
    wikiTitle: "艾弗里",
    analyze: (v) => {
      const fate = ["ascended", "saved", "fallen", "kicked"].includes(v.avery_fate);
      const feat = hasFeat(v, "Pride Cometh");
      const built = Number(v.avery_tower?.progress || 0) >= 100;
      return {
        status: fate || feat ? STATUS.COMPLETED : STATUS.INCOMPLETE,
        current: fate ? `已确定高塔结局：${localizeAveryFate(v.avery_fate)}。` : feat ? "本存档保留高塔结局选择后的成就；当前结局记录缺失，尾声需另核对。" : built ? "高塔施工已经完成，开幕邀请与结局剧情仍待推进。" : `高塔施工进度：${v.avery_tower?.progress || 0}/100。`,
        next: fate || feat ? [] : [built ? "继续艾弗里高塔的开幕邀请、赴宴与结局" : "继续艾弗里豪宅与高塔建设剧情"],
        evidence: [`高塔施工进度：${v.avery_tower?.progress || 0}/100（存档字段：avery_tower.progress）`, `结局状态：${localizeAveryFate(v.avery_fate)}（存档字段：avery_fate）`, `本存档高塔结局成就：${yesNo(feat)}`],
      };
    },
  },
  {
    id: "danube-ritual",
    title: "多瑙河街庄园地下仪式",
    wikiTitle: "多瑙河街",
    analyze: (v) => {
      const done = v.jordan_ritual_dance === 4 || hasFeat(v, "Breaking the Stone");
      return {
        status: done ? STATUS.COMPLETED : [1, 2, 3].includes(v.jordan_ritual_dance) ? STATUS.INCOMPLETE : STATUS.UNCERTAIN,
        current: done ? v.jordan_ritual_dance === 4 ? "地下仪式事件及后续约旦对话已结束。" : "本存档已确认逃离地下仪式；后续约旦对话不由成就确认。" : "当前没有可确认地下仪式结束的记录；禁用成就或旧存档可能需要人工确认。",
        next: done ? [] : [v.jordan_ritual_dance === 2 ? "向约旦报告庄园地下的发现" : "继续调查庄园与神殿的关联；若已经结束但没有记录，可人工确认"],
        evidence: [`仪式后续已结束：${yesNo(v.jordan_ritual_dance === 4)}（存档字段：jordan_ritual_dance）`, `本存档逃离仪式成就：${yesNo(hasFeat(v, "Breaking the Stone"))}`],
      };
    },
  },
];

const SEASONAL_QUESTS = [
  { id: "halloween-robin", title: "罗宾万圣节任务", wikiTitle: "罗宾的万圣节", marker: null, markerLabel: null },
  { id: "halloween-eden", title: "伊甸万圣节任务", wikiTitle: "伊甸的万圣节", marker: null, markerLabel: null },
  { id: "halloween-whitney", title: "惠特尼万圣节场景", wikiTitle: "惠特尼的万圣节", marker: "halloweenwhitney", markerLabel: "惠特尼万圣节提议" },
  { id: "halloween-kylar", title: "凯拉尔万圣节场景", wikiTitle: "凯拉尔的万圣节", marker: "halloweenkylar", markerLabel: "凯拉尔万圣节提议" },
  { id: "valentine-robin", title: "罗宾情人节任务", wikiTitle: "节日", marker: null, markerLabel: null },
  { id: "valentine-eden", title: "伊甸情人节场景", wikiTitle: "伊甸的情人节", marker: "Eden Valentines Bath", markerLabel: "伊甸情人节沐浴开始" },
  { id: "christmas-robin", title: "罗宾圣诞节任务", wikiTitle: "罗宾的圣诞节", marker: null, markerLabel: null },
  { id: "christmas-eden", title: "伊甸圣诞节任务", wikiTitle: "伊甸的圣诞节", marker: null, markerLabel: null },
];

function seasonalQuests(v) {
  return SEASONAL_QUESTS.map((item) => {
    const started = item.marker && includes(v.scenePassages, item.marker);
    return quest(
      { ...item, category: "季节任务" },
      {
        status: STATUS.SEASONAL,
        current: started ? `已有“${item.markerLabel}”记录，只能确认提议或场景开始，不能确认整个节日事件结束。` : "没有可靠的完整结束记录；部分当年状态会在节日窗口结束后清理。",
        next: ["在对应节日期间核对当前流程；已经完整经历时可人工确认"],
        evidence: [item.marker ? `${item.markerLabel}记录：${started ? "已出现" : "未发现"}（存档字段：scenePassages）` : "该事件没有可靠的永久完成变量"],
      },
    );
  });
}

function alternateQuests(v) {
  const defilementDone = includes(v.sydneySeen, "corruptroom");
  const averyResolved = Boolean(v.avery_fate);
  const promised = v.templePromised === "Sydney";
  const fox = v.avery_mansion?.fox;
  const quinn = fox?.task === "Quinn";
  const npcState = (name) => Array.isArray(v.NPCName) ? v.NPCName.find((npc) => npc?.nam === name)?.state : undefined;
  const averyState = npcState("Avery");
  const kylarState = npcState("Kylar");
  const whitneyState = npcState("Whitney");
  return [
    quest(
      { id: "sydney-promise", title: "悉尼承诺仪式", wikiTitle: "承诺仪式", category: "互斥路线" },
      {
        status: promised ? STATUS.COMPLETED : STATUS.ALTERNATE,
        current: promised ? "已经向悉尼作出承诺；该标记在承诺仪式末段写入，不确认后续所有离场对话。" : defilementDone ? "本存档保留亵渎仪式历史；承诺路线能否进入还需核对当前神殿条件。" : "这是悉尼神殿仪式的另一条可选路线。",
        evidence: [`已向悉尼承诺：${yesNo(promised)}（存档字段：templePromised）`, `亵渎仪式历史：${yesNo(defilementDone)}（存档字段：sydneySeen）`],
      },
    ),
    quest(
      { id: "avery-fox-residue", title: "棕狐的奎恩手势任务", wikiTitle: "艾弗里", category: "互斥路线" },
      {
        status: quinn && fox.task_complete === "success" ? STATUS.COMPLETED : quinn && !fox.task_complete && !averyResolved ? STATUS.INCOMPLETE : STATUS.ALTERNATE,
        current: `${quinn ? fox.task_complete === "success" ? "本轮奎恩手势委托已成功。" : fox.task_complete === "fail" ? "本轮奎恩手势委托已失败。" : "本轮奎恩手势委托尚未结算。" : fox?.task ? "当前记录属于其他棕狐委托，不能用来确认奎恩手势任务。" : "没有本轮奎恩手势委托记录。"}${averyResolved ? "高塔结局已确定，棕狐委托不再显示于正式日志。" : ""}`,
        evidence: [`艾弗里结局状态：${localizeAveryFate(v.avery_fate)}（存档字段：avery_fate）`, `本轮奎恩手势委托：${yesNo(quinn)}（存档字段：fox.task）`, `本轮委托结算：${fox?.task_complete === "success" ? "成功" : fox?.task_complete === "fail" ? "失败" : "未结算或无记录"}（存档字段：fox.task_complete）`],
      },
    ),
    quest(
      { id: "npc-exiles", title: "非玩家角色放逐路线", wikiTitle: "放逐NPC", enWikiTitle: "Dismissing NPCs", category: "互斥路线" },
      {
        status: STATUS.ALTERNATE,
        current: "NPC 的离开、关押与结局属于可选分支，助手在此单独列出。",
        evidence: ["不同 NPC 使用不同处置机制；不存在通用的永久放逐状态"],
      },
    ),
    quest(
      { id: "npc-exile-avery", title: "放逐艾弗里", wikiTitle: "放逐艾弗里", enWikiTitle: "Dismissing Avery", category: "互斥路线" },
      {
        status: STATUS.ALTERNATE,
        current: v.avery_fate === "kicked" ? "高塔记录为艾弗里被踢下楼身亡，属于死亡结局。" : averyState === "dismissed" ? "艾弗里当前已离开恋爱路线；游戏另有恢复关系的流程。" : averyState === "active" ? "艾弗里当前处于活动状态。" : "当前没有可确认艾弗里离开状态的记录。",
        evidence: [`艾弗里当前状态：${averyState === "dismissed" ? "已离开" : averyState === "active" ? "活动中" : "待确认"}（存档字段：NPCName）`, `高塔结局：${localizeAveryFate(v.avery_fate)}（存档字段：avery_fate）`],
      },
    ),
    quest(
      { id: "npc-exile-kylar", title: "放逐凯拉尔", wikiTitle: "放逐凯拉尔", enWikiTitle: "Dismissing Kylar", category: "互斥路线" },
      {
        status: STATUS.ALTERNATE,
        current: kylarState === "prison" ? "凯拉尔当前被关押在监狱；越狱后可以恢复活动。" : kylarState === "active" ? "凯拉尔当前处于活动状态。" : "当前没有可确认凯拉尔关押或活动状态的记录。",
        evidence: [`凯拉尔当前状态：${kylarState === "prison" ? "监狱关押" : kylarState === "active" ? "活动中" : "待确认"}（存档字段：NPCName）`],
      },
    ),
    quest(
      { id: "npc-exile-whitney", title: "放逐惠特尼", wikiTitle: "放逐惠特尼", enWikiTitle: "Dismissing Whitney", category: "互斥路线" },
      {
        status: STATUS.ALTERNATE,
        current: whitneyState === "dungeon" ? "惠特尼当前处于地下关押状态。" : whitneyState === "active" ? "惠特尼当前处于活动状态。" : "当前没有可确认惠特尼关押或活动状态的记录。",
        evidence: [`惠特尼当前状态：${whitneyState === "dungeon" ? "地下关押" : whitneyState === "active" ? "活动中" : "待确认"}（存档字段：NPCName）`],
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
        status: stage >= 7 ? STATUS.RECURRING : STATUS.LOCKED,
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
      next: [],
      note: "此结果依据你的确认，不修改游戏任务变量；周期事件仍可再次发生。",
      evidence: [...item.evidence, "人工确认：已完成"],
    };
  });
}

export function getWikiTitles() {
  return [...new Set(analyzeQuests({ variables: {} }).map((item) => item.wikiTitle).filter(Boolean))];
}

export { STATUS };
