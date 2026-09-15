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
  const all = variables.feats?.allSaves;
  return Boolean(
    (Array.isArray(current) ? current.includes(name) : current && Object.hasOwn(current, name)) ||
      (Array.isArray(all) ? all.includes(name) : all && Object.hasOwn(all, name)),
  );
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
  const clearing = Math.floor(Number(v.farm?.clearing ?? 100));
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

function analyzeBaileyPayments(v) {
  const rentDay = Math.floor(Number(v.rentday ?? 7));
  const rentMoney = Number(v.rentmoney || 0);
  const currentMoney = Number(v.money || 0);
  const rentPounds = Math.floor(rentMoney / 100);
  const currentPounds = Math.floor(currentMoney / 100);

  if (rentDay <= 0) {
    const affordable = currentMoney >= rentMoney;
    const shortPounds = Math.ceil((rentMoney - currentMoney) / 100);
    return {
      status: STATUS.INCOMPLETE,
      current: affordable
        ? `今天是交租日，持有现金充足（现有 £${currentPounds} / 需付 £${rentPounds}），请在中午 12 点前交给贝利。`
        : `今天是交租日，持有现金不足（现有 £${currentPounds} / 需付 £${rentPounds}，缺少 £${shortPounds}），请尽快筹款！`,
      next: affordable
        ? ["前往孤儿院将周租交付给贝利"]
        : ["通过探险、打工或变卖物品筹集周租，避免被送入感化院或遭暴力对待"],
      evidence: [
        `距离交租剩余：${rentDay} 天（存档字段：rentday）`,
        `本周租金：£${rentPounds}（存档字段：rentmoney）`,
        `当前现金：£${currentPounds}（存档字段：money）`,
      ],
    };
  }

  const shortPounds = Math.ceil((rentMoney - currentMoney) / 100);
  return {
    status: STATUS.RECURRING,
    current: `距离下次交租还剩 ${rentDay} 天；本周需交 £${rentPounds}，当前持有现金 £${currentPounds}。`,
    next: currentMoney >= rentMoney
      ? ["资金已备齐，等待交租日前往孤儿院交付"]
      : [`还差 £${shortPounds}，可通过打工或探险筹款`],
    evidence: [
      `距离交租剩余：${rentDay} 天（存档字段：rentday）`,
      `本周租金：£${rentPounds}（存档字段：rentmoney）`,
      `当前现金：£${currentPounds}（存档字段：money）`,
    ],
  };
}

function analyzeSchoolProjects(v) {
  const scienceDone = v.scienceprojectwon === 1 || v.scienceproject === "done";
  const mathsDone = v.mathsproject === "done";
  const historyProgress = Math.floor(Number(v.historyproject || 0));
  const historyDone = historyProgress >= 100 || v.historyproject === "done";
  const artProgress = Math.floor(Number(v.artproject || 0));
  const artDone = artProgress >= 100 || v.artproject === "done";

  const completed = [scienceDone, mathsDone, historyDone, artDone].filter(Boolean).length;
  const pendingProjects = [];
  if (!scienceDone) pendingProjects.push("科学博览会项目");
  if (!mathsDone) pendingProjects.push("数学竞赛作业");
  if (!historyDone) pendingProjects.push(`历史作业（当前进度：${historyProgress}%）`);
  if (!artDone) pendingProjects.push(`美术作品（当前进度：${artProgress}%）`);

  if (completed === 4) {
    return {
      status: STATUS.COMPLETED,
      current: "学校四大项目（科学、数学、历史、美术）已全部完成！",
      evidence: [
        "科学项目：已完成",
        "数学项目：已完成",
        "历史项目：已完成",
        "美术项目：已完成",
      ],
      progress: { value: 4, max: 4, label: "4 / 4" },
    };
  }

  return {
    status: STATUS.INCOMPLETE,
    current: `学校学术项目已完成 ${completed}/4；待推进：${pendingProjects.join("、")}。`,
    next: pendingProjects.map((name) => `继续推进${name}`),
    evidence: [
      `科学项目：${scienceDone ? "已完成" : "未完成"}（存档字段：scienceproject）`,
      `数学项目：${mathsDone ? "已完成" : "未完成"}（存档字段：mathsproject）`,
      `历史项目进度：${historyDone ? "100%" : `${historyProgress}%`}（存档字段：historyproject）`,
      `美术项目进度：${artDone ? "100%" : `${artProgress}%`}（存档字段：artproject）`,
    ],
    progress: { value: completed, max: 4, label: `${completed} / 4` },
  };
}

function analyzeSmugglers(v) {
  const known = Boolean(v.smuggler_known || v.smuggler_location);
  const timer = Number(v.smuggler_timer || 0);
  if (known) {
    return {
      status: STATUS.INCOMPLETE,
      current: timer > 0
        ? `已获知走私者线索，等待时机推进（剩余倒计时：${timer}）。`
        : "走私集团暗道与接头地点已探明，可前往海岸秘密据点推进。",
      next: ["在指定时段潜入走私据点或与老水手酒吧联络人接头"],
      evidence: [
        `走私者线索已获知：是（存档字段：smuggler_known / smuggler_location）`,
        `走私事件倒计时：${timer}（存档字段：smuggler_timer）`,
      ],
    };
  }
  return {
    status: STATUS.LOCKED,
    current: "尚未掌握走私者据点与行动情报。",
    next: ["前往老水手酒吧打听走私传闻，或在沿海礁石区搜寻踪迹"],
    evidence: ["尚未发现走私线索（存档字段：smuggler_known）"],
  };
}

function analyzeDocksInfiltration(v) {
  const container = Number(v.dock_container || 0);
  const docksSeen = Boolean(v.docks || v.docks_investigation);
  if (container >= 1) {
    return {
      status: STATUS.INCOMPLETE,
      current: `码头集装箱调查已经展开（阶段：${container}）。`,
      next: ["趁夜间守卫松懈潜入商业码头集装箱区获取线索"],
      evidence: [`集装箱调查阶段：${container}（存档字段：dock_container）`],
    };
  }
  return {
    status: docksSeen ? STATUS.INCOMPLETE : STATUS.LOCKED,
    current: docksSeen ? "已踏足商业码头，可寻找潜入机会。" : "尚未探索商业码头。",
    next: ["夜间前往商业码头寻找可翻越的围栏或集装箱入口"],
    evidence: [`码头区域探索记录：${yesNo(docksSeen)}（存档字段：docks）`],
  };
}

function analyzePoliceInfiltration(v) {
  const intro = Number(v.police_intro || 0);
  const hack = Number(v.police_hack || 0);
  if (hack >= 1) {
    return {
      status: STATUS.COMPLETED,
      current: "已成功渗透警局档案系统，清理了案底记录。",
      evidence: [`警局系统入侵成功：是（存档字段：police_hack）`],
    };
  }
  if (intro >= 1) {
    return {
      status: STATUS.INCOMPLETE,
      current: "已掌握警局内部排班与监控盲区，可展开深入潜入。",
      next: ["盗取警局钥匙卡或在深夜潜入机房与证据陈列室"],
      evidence: [`警局布局认知阶段：${intro}（存档字段：police_intro）`],
    };
  }
  return {
    status: STATUS.LOCKED,
    current: "尚未掌握警局内部布局。",
    next: ["前往商业街警察局踩点并寻找潜入突破口"],
    evidence: ["警局潜入尚未开启（存档字段：police_intro）"],
  };
}

function analyzeChastityVow(v) {
  const rank = v.temple_rank;
  const isMember = ["initiate", "monk", "priest", "sister"].includes(rank);
  const wornBelt = String(v.worn?.genitals?.name || "").toLowerCase().includes("chastity");

  if (!isMember) {
    return {
      status: STATUS.LOCKED,
      current: `尚未加入神殿，无法接受贞洁誓言（当前身份：${localizeTempleRank(rank)}）。`,
      next: ["前往狼街神殿完成入教仪式"],
      evidence: [`神殿身份：${localizeTempleRank(rank)}（存档字段：temple_rank）`],
    };
  }

  return {
    status: wornBelt ? STATUS.COMPLETED : STATUS.INCOMPLETE,
    current: wornBelt
      ? `已立下神殿贞洁誓言，并正在佩戴贞洁装置（${v.worn?.genitals?.name || "贞洁锁"}）。`
      : "已是神殿成员，尚未穿戴贞洁装置以履行贞洁誓言。",
    next: wornBelt ? ["继续保持纯洁信仰，提升神殿声望"] : ["向神殿长辈申请或自愿佩戴贞洁锁"],
    evidence: [
      `神殿身份：${localizeTempleRank(rank)}（存档字段：temple_rank）`,
      `当前下身装备：${v.worn?.genitals?.name || "未佩戴专用贞洁装置"}（存档字段：worn.genitals.name）`,
    ],
  };
}

function analyzeCharlieJobs(v) {
  const job = Number(v.charlie_job || 0);
  const stage = Number(v.charlie_stage || 0);
  if (job >= 1 || stage >= 1) {
    return {
      status: STATUS.INCOMPLETE,
      current: `已在查理处承接工作（当前职务阶段：${job || stage}）。`,
      next: ["按时前往舞蹈工作室或娱乐会所打工推进信赖度"],
      evidence: [`查理工作阶段：${job || stage}（存档字段：charlie_job / charlie_stage）`],
    };
  }
  return {
    status: STATUS.LOCKED,
    current: "尚未从查理处获得工作委托。",
    next: ["前往海滩街舞蹈工作室结识查理"],
    evidence: ["尚未开启查理工作线（存档字段：charlie_job）"],
  };
}

function analyzeDanubeBurglary(v) {
  const burglar = Number(v.danube_burglar || v.burglar || 0);
  if (burglar >= 1) {
    return {
      status: STATUS.INCOMPLETE,
      current: `已踩点多瑙河街豪宅入室盗窃路线（踩点阶段：${burglar}）。`,
      next: ["在深夜避开警犬与巡逻保安，潜入多瑙河街宅邸探寻贵重物品"],
      evidence: [`入室盗窃踩点进度：${burglar}（存档字段：danube_burglar）`],
    };
  }
  return {
    status: STATUS.LOCKED,
    current: "尚未发现多瑙河街豪宅的盗窃机会。",
    next: ["提升撬锁技能或在夜间多瑙河街观察巡逻规律"],
    evidence: ["尚未开启多瑙河街入室盗窃（存档字段：danube_burglar）"],
  };
}

function analyzeGwylansRituals(v) {
  const met = Boolean(v.gwylan || includes(v.gwylanSeen, "shop") || includes(v.gwylanTalked, "intro"));
  const rescue = Number(v.gwylan_rescue || 0);
  if (met || rescue >= 1) {
    return {
      status: STATUS.COMPLETED,
      current: "已在森林商店结识店主格威兰，可利用其特殊仪式协助净化世界腐化。",
      next: ["拜访森林商店，向格威兰购买特制草药或举行净化仪式"],
      evidence: [`已结识森林店主格威兰：是（存档字段：gwylan / gwylanSeen）`],
    };
  }
  return {
    status: STATUS.LOCKED,
    current: "尚未在森林深处找到森林商店并结识格威兰。",
    next: ["深入森林探索，在暴风雨后搜寻遇险的格威兰并开启森林商店"],
    evidence: ["尚未结识格威兰（存档字段：gwylan）"],
  };
}

function analyzeTrialByFire(v) {
  const rank = v.temple_rank;
  const isMember = ["initiate", "monk", "priest", "sister"].includes(rank);
  if (isMember) {
    return {
      status: STATUS.COMPLETED,
      current: `已经通过神殿入教考验（处子纯洁测试或烈火净身试炼），当前阶位：${localizeTempleRank(rank)}。`,
      evidence: [`神殿身份：${localizeTempleRank(rank)}（存档字段：temple_rank）`],
    };
  }
  return {
    status: STATUS.INCOMPLETE,
    current: "尚未在狼街神殿完成入教考核或火的考验。",
    next: ["前往狼街神殿向约旦主教申请入教；非纯洁状态需接受火的考验"],
    evidence: [`当前神殿身份：未加入（存档字段：temple_rank）`],
  };
}

function analyzeSchoolExams(v) {
  const science = Math.floor(Number(v.science_exam || 0));
  const maths = Math.floor(Number(v.maths_exam || 0));
  const english = Math.floor(Number(v.english_exam || 0));
  const history = Math.floor(Number(v.history_exam || 0));
  const avg = Math.floor((science + maths + english + history) / 4);
  const allPassed = science >= 60 && maths >= 60 && english >= 60 && history >= 60;

  return {
    status: allPassed ? STATUS.COMPLETED : STATUS.INCOMPLETE,
    current: allPassed
      ? `周五学校考试全科通过（平均分：${avg}分；科学 ${science} / 数学 ${maths} / 英语 ${english} / 历史 ${history}）。`
      : `当前学科考试成绩尚未全科达标（平均分：${avg}分；科学 ${science} / 数学 ${maths} / 英语 ${english} / 历史 ${history}）。`,
    next: allPassed
      ? ["在每周五课程期间继续维持优良成绩并争取最高评级"]
      : ["在周一至周五认真听课并前往图书馆温习功课，备战周五下午的四门周考"],
    evidence: [
      `科学成绩：${science}分（存档字段：science_exam）`,
      `数学成绩：${maths}分（存档字段：maths_exam）`,
      `英语成绩：${english}分（存档字段：english_exam）`,
      `历史成绩：${history}分（存档字段：history_exam）`,
    ],
  };
}

function analyzeDetention(v) {
  const detention = Math.floor(Number(v.detention || 0));
  if (detention > 0) {
    return {
      status: STATUS.INCOMPLETE,
      current: `当前累计有 ${detention} 点学校留堂惩罚尚未服满。`,
      next: ["周一至周五放学后前往留堂教室接受礼顿的监督服刑，或通过优良表现扣减"],
      evidence: [`积压留堂点数：${detention}点（存档字段：detention）`],
    };
  }
  return {
    status: STATUS.COMPLETED,
    current: "目前操行记录良好，没有未执行的留堂违纪惩罚。",
    evidence: ["当前留堂积压点数：0点（存档字段：detention）"],
  };
}

function analyzeCommunityService(v) {
  const service = Math.floor(Number(v.community_service || 0));
  if (service > 0) {
    return {
      status: STATUS.INCOMPLETE,
      current: `尚有 ${service} 次治安法庭判处的社区劳役服务等待履行。`,
      next: ["前往市政厅广场或警局接受分配，完成清扫街道或粉刷等义工劳役"],
      evidence: [`剩余社区服务次数：${service}次（存档字段：community_service）`],
    };
  }
  return {
    status: STATUS.COMPLETED,
    current: "当前无待履行的社区治安劳役令。",
    evidence: ["当前无社区服务记录（存档字段：community_service）"],
  };
}

function analyzePillory(v) {
  const inPillory = Boolean(v.pillory || v.pillory_tenant);
  if (inPillory) {
    return {
      status: STATUS.INCOMPLETE,
      current: "当前正被锁在悬崖街颈手枷示众服刑中。",
      next: ["忍耐示众受辱直至刑期结束，或等待同伴协助解救"],
      evidence: ["当前受刑状态：颈手枷公开示众处刑中（存档字段：pillory）"],
    };
  }
  return {
    status: STATUS.COMPLETED,
    current: "自由行动中，未受到颈手枷公开示众刑罚。",
    evidence: ["当前未处于颈手枷刑罚中（存档字段：pillory）"],
  };
}

function analyzeLandrysRequest(v) {
  const stage = Math.floor(Number(v.landry || 0));
  const hasBox = Math.floor(Number(v.blackbox || 0));
  const known = Boolean(v.landry_loft_known || stage >= 1);
  if (stage >= 2 || hasBox >= 2) {
    return {
      status: STATUS.COMPLETED,
      current: "已成功将打捞的黑匣子交付给码头兰德里完成委托。",
      evidence: [`兰德里委托完成：是（存档字段：landry）`],
    };
  }
  if (hasBox === 1) {
    return {
      status: STATUS.INCOMPLETE,
      current: "已从深海打捞到黑匣子，尚未带回码头移交给兰德里。",
      next: ["返回商业码头仓库区，将黑匣子交付给兰德里"],
      evidence: ["已打捞到黑匣子：是（存档字段：blackbox）"],
    };
  }
  if (known) {
    return {
      status: STATUS.INCOMPLETE,
      current: "已承接兰德里的黑匣子委托，正在搜寻海底沉船与遗迹线索。",
      next: ["潜入商业码头深水区或沉船海域打捞遗失的黑匣子"],
      evidence: [`已掌握兰德里委托线索：是（存档字段：landry_loft_known）`],
    };
  }
  return {
    status: STATUS.LOCKED,
    current: "尚未接触兰德里接取打捞黑匣子委托。",
    next: ["前往商业码头仓库区与兰德里交谈，探听黑匣子打捞线索"],
    evidence: ["尚未开启兰德里委托（存档字段：landry）"],
  };
}

function analyzeLockerRaid(v) {
  const looted = Math.floor(Number(v.lockers_looted || 0));
  const suspicion = Math.floor(Number(v.locker_suspicion || 0));
  if (looted >= 1) {
    return {
      status: STATUS.COMPLETED,
      current: `已掌握更衣室撬锁手法（累计洗劫锁柜：${looted}次；当前嫌疑度：${suspicion}）。`,
      next: ["在课间或放学后避开更衣室人流，搜寻锁柜获取财物并在黑市出售"],
      evidence: [
        `累计洗劫柜子次数：${looted}次（存档字段：lockers_looted）`,
        `更衣室嫌疑度：${suspicion}（存档字段：locker_suspicion）`,
      ],
    };
  }
  return {
    status: STATUS.INCOMPLETE,
    current: "尚未尝试撬开学校泳池或更衣室的上锁衣柜。",
    next: ["提升撬锁技能并在学校泳池更衣室寻找可下手的目标锁柜"],
    evidence: ["尚未开始洗劫更衣室锁柜（存档字段：lockers_looted）"],
  };
}

function analyzeDanubeJobs(v) {
  const jobs = Math.floor(Number(v.danube_jobs || v.danubework || 0));
  if (jobs >= 1) {
    return {
      status: STATUS.COMPLETED,
      current: `已在多瑙河街豪宅区承接家政与兼职服务（已完成工作次数：${jobs}）。`,
      next: ["白天在多瑙河街逐户敲门，为富裕居民提供家政、园艺或陪伴工作"],
      evidence: [`多瑙河街工作完成次数：${jobs}（存档字段：danube_jobs / danubework）`],
    };
  }
  return {
    status: STATUS.LOCKED,
    current: "尚未在多瑙河街豪宅区开启家政工作委托。",
    next: ["提升着装品位与社交礼仪，日间前往多瑙河街敲门寻找工作"],
    evidence: ["尚未开启多瑙河街工作（存档字段：danube_jobs）"],
  };
}

function analyzeSabotagingRemy(v) {
  const farmStage = Math.floor(Number(v.farm_stage || 0));
  const sabotaged = Boolean(v.remy_sabotaged || v.estate_fence);
  if (farmStage < 7) {
    return {
      status: STATUS.LOCKED,
      current: `艾利克斯农田建设未达防守阶段（当前：${farmStage}/12），尚未解锁破坏行动。`,
      next: ["继续建设艾利克斯农场直至阶段 7 触发袭击剧情"],
      evidence: [`农场建设阶段：${farmStage}/12（存档字段：farm_stage）`],
    };
  }
  if (sabotaged) {
    return {
      status: STATUS.COMPLETED,
      current: "已成功潜入雷米庄园实施破坏，有效削弱了敌对袭击部队的规模与攻势。",
      next: ["继续协助艾利克斯巡防农田，抵御雷米农场的后续进攻"],
      evidence: ["已对雷米农场展开潜入破坏：是（存档字段：remy_sabotaged / estate_fence）"],
    };
  }
  return {
    status: STATUS.INCOMPLETE,
    current: "雷米庄园对艾利克斯农场的袭击威胁已出现，可夜间潜入雷米庄园反击破坏。",
    next: ["趁夜色穿过农田潜入雷米庄园，破坏其马厩、供电网络或饲料设施"],
    evidence: [`农场防守阶段已开启：是（存档字段：farm_stage >= 7）`],
  };
}

function analyzeDomusBurglary(v) {
  const burglar = Math.floor(Number(v.domus_burglar || v.burglar || 0));
  if (burglar >= 1) {
    return {
      status: STATUS.INCOMPLETE,
      current: `已探明宅邸街入室盗窃路线（踩点进度：${burglar}）。`,
      next: ["深夜在宅邸街潜入民宅，规避看门狗与保安搜寻财物"],
      evidence: [`宅邸街盗窃踩点进度：${burglar}（存档字段：domus_burglar）`],
    };
  }
  return {
    status: STATUS.LOCKED,
    current: "尚未发现宅邸街民宅的入室盗窃机会。",
    next: ["提升撬锁技巧，深夜在宅邸街观察巡逻规律寻找破绽"],
    evidence: ["尚未开启宅邸街盗窃路线（存档字段：domus_burglar）"],
  };
}

function analyzeDomusJobs(v) {
  const jobs = Math.floor(Number(v.domus_jobs || v.domuswork || 0));
  if (jobs >= 1) {
    return {
      status: STATUS.COMPLETED,
      current: `已在宅邸街建立稳定家政打工信赖（已完成工作：${jobs}次）。`,
      next: ["日间前往宅邸街各户敲门应聘，赚取生活费用"],
      evidence: [`宅邸街工作完成次数：${jobs}（存档字段：domus_jobs）`],
    };
  }
  return {
    status: STATUS.INCOMPLETE,
    current: "尚未在宅邸街承接住户家政服务。",
    next: ["日间前往宅邸街敲门询问住户是否需要清洁或跑腿帮助"],
    evidence: ["尚未开展宅邸街兼职打工（存档字段：domus_jobs）"],
  };
}

function analyzeDomusHunting(v) {
  const isDemon = Math.floor(Number(v.demon || 0)) >= 6;
  const hunting = Math.floor(Number(v.domus_hunting || 0));
  if (!isDemon) {
    return {
      status: STATUS.LOCKED,
      current: "非恶魔形态无法在宅邸街夜间窗台进行狩猎。",
      next: ["在森林或仪式中转化堕落为恶魔形态"],
      evidence: ["当前非恶魔形态（存档字段：demon < 6）"],
    };
  }
  return {
    status: hunting >= 1 ? STATUS.COMPLETED : STATUS.INCOMPLETE,
    current: hunting >= 1
      ? `已具备恶魔夜间狩猎经验（狩猎记录：${hunting}次）。`
      : "已是恶魔形态，可在夜间前往宅邸街窗台寻觅猎物。",
    next: ["夜间潜行至宅邸街各户二楼窗台观察猎物并展开诱捕狩猎"],
    evidence: [
      "恶魔形态已达成：是（存档字段：demon >= 6）",
      `夜间狩猎记录：${hunting}次（存档字段：domus_hunting）`,
    ],
  };
}

function analyzeExhibitionism(v) {
  const ex = Math.floor(Number(v.exhibitionism || 0));
  return {
    status: ex >= 75 ? STATUS.COMPLETED : STATUS.INCOMPLETE,
    current: `当前暴露癖水平：${ex}/100。`,
    next: ex >= 75
      ? ["暴露癖已达到极高水平，可从容应对各区域极限暴露挑战"]
      : ["在公共场合接受更高难度的暴露挑战以提升暴露技能与胆量"],
    evidence: [`暴露癖数值：${ex}/100（存档字段：exhibitionism）`],
    progress: { value: ex, max: 100, label: `${ex} / 100` },
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
      { id: "npc-exiles", title: "非玩家角色放逐路线", wikiTitle: "放逐NPC", enWikiTitle: "Dismissing NPCs", category: "互斥路线" },
      {
        status: STATUS.ALTERNATE,
        current: "放逐主要 NPC 属于破坏性替代结局，不计入正常主线缺口。",
        evidence: ["助手默认不把可选坏结局计入常规未完成任务"],
      },
    ),
    quest(
      { id: "npc-exile-avery", title: "放逐艾弗里", wikiTitle: "放逐艾弗里", enWikiTitle: "Dismissing Avery", category: "互斥路线" },
      {
        status: STATUS.ALTERNATE,
        current: v.avery_fate === "kicked" ? "艾弗里已被永久逐出城镇。" : "艾弗里仍在城中活跃；放逐会导致其剧情永久中断。",
        evidence: [`艾弗里状态：${v.avery_fate === "kicked" ? "已放逐" : "正常"}（存档字段：avery_fate）`],
      },
    ),
    quest(
      { id: "npc-exile-kylar", title: "放逐凯拉尔", wikiTitle: "放逐凯拉尔", enWikiTitle: "Dismissing Kylar", category: "互斥路线" },
      {
        status: STATUS.ALTERNATE,
        current: v.kylar_exile || v.kylar_prison ? "凯拉尔已被送走或关押，不再骚扰玩家。" : "凯拉尔仍在正常活动；放逐属于特殊处置路线。",
        evidence: [`凯拉尔放逐状态：${v.kylar_exile || v.kylar_prison ? "已放逐" : "正常"}（存档字段：kylar_exile）`],
      },
    ),
    quest(
      { id: "npc-exile-whitney", title: "放逐惠特尼", wikiTitle: "放逐惠特尼", enWikiTitle: "Dismissing Whitney", category: "互斥路线" },
      {
        status: STATUS.ALTERNATE,
        current: v.whitney_exile ? "惠特尼已被赶出城镇。" : "惠特尼仍在学校与小巷出没；放逐属于特殊分支路线。",
        evidence: [`惠特尼放逐状态：${v.whitney_exile ? "已放逐" : "正常"}（存档字段：whitney_exile）`],
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
