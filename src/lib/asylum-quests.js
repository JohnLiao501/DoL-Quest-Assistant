const BRANCHES = [
  { field: "asylum_office", title: "旧办公室", feat: "Record Keeper", lastStage: 5 },
  { field: "asylum_garden", title: "隐蔽花园", feat: "Bramble Tamer", lastStage: 5 },
  { field: "asylum_tunnels", title: "地下隧道", feat: "Eyes in the Night", lastStage: 6 },
  { field: "asylum_mirror", title: "镜室幻象", feat: "Mirror Madness", lastStage: 5 },
];

function hasCurrentFeat(v, name) {
  const current = v.feats?.currentSave;
  return Array.isArray(current)
    ? current.includes(name)
    : Boolean(current && typeof current === "object" && Object.hasOwn(current, name));
}

function readStage(v, branch) {
  const value = Number(v[branch.field]);
  return Number.isFinite(value) ? Math.max(0, Math.min(branch.lastStage, Math.floor(value))) : 0;
}

function nextFor(branch, stage) {
  if (stage >= branch.lastStage) {
    return `核对${branch.title}的最后对话；当前阶段已到末尾，但尚未记录本存档的完成成就，完成待确认`;
  }
  switch (branch.field) {
    case "asylum_office":
      return stage > 0
        ? "继续清理、整理旧办公室，提高家务技能并完成最后对话"
        : "继续探索禁区，找到旧办公室";
    case "asylum_garden":
      return stage > 0
        ? "继续修剪隐蔽花园，提高种植技能并看完最后事件"
        : "继续探索禁区，找到荒废的花园";
    case "asylum_tunnels":
      return stage === 5
        ? "返回地下隧道中的囚禁房间，拉下拉杆释放生物"
        : stage > 0
          ? "提高游泳技能，继续探索地下隧道，找到并释放囚禁的生物"
          : "继续清理花园，找到水流与地下隧道入口";
    default:
      return stage === 1
        ? "在镜室开始跳舞，开启幻象路线"
        : stage > 0
          ? "从办公室、花园和隧道收集镜子，放入镜室并继续幻象事件"
          : "探索禁区，揭开镜室中的镜子";
  }
}

export function analyzeAsylumExploration(v) {
  const branches = BRANCHES.map((branch) => ({
    ...branch,
    stage: readStage(v, branch),
    done: hasCurrentFeat(v, branch.feat),
  }));
  const completed = branches.filter((branch) => branch.done).length;
  const finalEventUnconfirmed = branches.some((branch) => !branch.done && branch.stage >= branch.lastStage);
  const unlocked = Number(v.asylum_depths) > 0 || branches.some((branch) => branch.stage > 0 || branch.done);
  const progress = { value: completed, max: 4, label: `${completed} / 4` };
  const evidence = branches.map((branch) => branch.done
    ? `${branch.title}：本存档已记录完成成就`
    : `${branch.title}：${branch.stage > 0 ? `探索阶段 ${branch.stage}/${branch.lastStage}` : "尚无探索记录"}，${branch.stage >= branch.lastStage ? "完成待确认" : "尚未记录完成成就"}`);

  if (!unlocked) {
    return {
      status: "locked",
      current: "尚未发现精神病院禁区探索记录。旧办公室、隐蔽花园、地下隧道与镜室幻象均待开启。",
      next: ["在精神病院可以自由活动时，穿好衣服后观察不祥走廊，开启禁区探索"],
      evidence,
      progress,
      note: "此内容从游戏 0.5.12 起提供；旧版存档尚无记录时不会判定为已完成。",
    };
  }

  return {
    status: completed === 4 ? "completed" : finalEventUnconfirmed ? "uncertain" : "incomplete",
    current: `禁区探索已完成 ${completed}/4 条路线；${branches.map((branch) => `${branch.title}：${branch.done ? "已完成" : branch.stage >= branch.lastStage ? `阶段 ${branch.stage}/${branch.lastStage}，完成待确认` : branch.stage > 0 ? `阶段 ${branch.stage}/${branch.lastStage}，探索中` : "待探索"}`).join("；")}。`,
    next: completed === 4 ? [] : branches.filter((branch) => !branch.done).map((branch) => nextFor(branch, branch.stage)),
    evidence,
    progress,
    note: "自动完成以本存档的四项成就为准；其他存档取得的成就和阶段数字均不代替最终事件记录。禁用成就的存档可能已经看完末尾事件，请核对后在助手中人工确认。探索期间须按时返回参加精神病院的规定活动。",
  };
}
