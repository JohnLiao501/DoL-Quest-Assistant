const CHARACTER_NAMES = {
  Alex: "艾利克斯",
  Avery: "艾弗里",
  Doren: "多伦",
  Eden: "伊甸",
  Jordan: "约旦",
  Kylar: "凯拉尔",
  Landry: "兰德里",
  Leighton: "礼顿",
  Quinn: "奎恩",
  Remy: "雷米",
  Robin: "罗宾",
  Sydney: "悉尼",
  Whitney: "惠特尼",
};

const PASSAGE_NAMES = {
  Forest: "森林",
  Farm: "农场",
  School: "学校",
  Temple: "神殿",
  Town: "城镇",
};

const TEMPLE_RANKS = {
  initiate: "见习者",
  monk: "修士",
  priest: "祭司",
};

const WRAITH_STATES = {
  despair: "绝望",
  dormant: "沉睡",
  gone: "已离开",
  haunt: "纠缠",
  recovering: "恢复中",
  wrath: "愤怒",
};

const ESCAPE_ROUTES = {
  night: "夜间逃脱",
  river: "沿河逃脱",
  tunnel: "隧道逃脱",
};

const AVERY_FATES = {
  fallen: "已堕落",
  kicked: "已被逐出",
  saved: "已获救",
};

const MATHS_PROJECT_STATES = {
  failed: "失败",
  lost: "未获胜",
  started: "进行中",
  won: "已获胜",
};

const PLAY_ROLES = {
  Cass: "卡斯",
  Sterling: "斯特林",
  Taylor: "泰勒",
};

const WIKI_TITLES = {
  Tenyclus: "街机游戏最终事件",
  "放逐NPC": "放逐非玩家角色",
};

const TEXT_REPLACEMENTS = [
  ["Degrees of Lewdity CN Wiki", "欲都孤儿中文攻略站"],
  ["Degrees of Lewdity", "欲都孤儿"],
  ["Breaking the Stone", "破石仪式成就"],
  ["Science Fair Winner", "科学博览会优胜者"],
  ["enwiki", "英文攻略站"],
  ["NPC", "非玩家角色"],
  ["DOL", "欲都孤儿"],
  ["Tenyclus", "泰尼克勒斯"],
  ["Danube", "多瑙河街"],
  ...Object.entries(CHARACTER_NAMES),
].sort(([left], [right]) => right.length - left.length);

function mappedValue(value, mapping, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return mapping[value] || fallback;
}

export function localizePassage(value) {
  if (PASSAGE_NAMES[value]) return PASSAGE_NAMES[value];
  if (/^[\u3400-\u9fff]/u.test(String(value || ""))) return String(value);
  return value ? "未收录场景（原名见核验依据）" : "未知场景";
}

export function localizeTempleRank(value) {
  return mappedValue(value, TEMPLE_RANKS, value ? "未识别身份" : "未加入");
}

export function localizeWraithState(value) {
  return mappedValue(value, WRAITH_STATES, value ? "未识别状态" : "未知");
}

export function localizeEscapeRoute(value) {
  return mappedValue(value, ESCAPE_ROUTES, value ? "其他逃脱路线" : "未出现");
}

export function localizeAveryFate(value) {
  return mappedValue(value, AVERY_FATES, value ? "结局已确定" : "未出现");
}

export function localizeMathsProjectState(value) {
  return mappedValue(value, MATHS_PROJECT_STATES, value ? "其他状态" : "未开始");
}

export function localizePlayRole(value) {
  return mappedValue(value, PLAY_ROLES, value ? "其他角色" : "未出现");
}

export function localizeWikiTitle(value) {
  return WIKI_TITLES[value] || localizeKnownTerms(value);
}

export function localizeKnownTerms(value) {
  let text = String(value || "");
  text = text.replace(/（[A-Za-z][A-Za-z\s'’/-]*）\s*/g, "");
  text = text.replace(
    /本页取自enwiki，(?:汉化游戏)?版本\s*[0-9.]+-chs-alpha[0-9.]+/g,
    "本页译自英文攻略站，内容对应较早的汉化版本。",
  );
  for (const [english, chinese] of TEXT_REPLACEMENTS) {
    text = text.replace(new RegExp(`\\b${english.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`, "g"), chinese);
  }
  return text.replace(/\s{2,}/g, " ").trim();
}

export function yesNo(value) {
  return value ? "是" : "否";
}
