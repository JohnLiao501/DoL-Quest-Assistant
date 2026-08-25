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
  "Asylum Cell": "精神病院牢房",
  "Barb Street": "倒钩街",
  Beach: "海滩",
  Bedroom: "卧室",
  "Bird Tower": "鸟塔",
  Brothel: "妓院",
  "Cliff Street": "峭壁街",
  "Commercial Alleyways": "商业街小巷",
  "Connudatus Street": "康努达塔斯街",
  "Danube Street": "多瑙河街",
  "Docks Work": "码头工作区",
  "Domus Street": "宅邸街",
  "Eden Cabin": "伊甸小屋",
  "Elk Street": "麋鹿街",
  Farm: "农场",
  Farmland: "农田",
  Forest: "森林",
  "Forest Wolf Cave": "森林狼穴",
  Hallways: "走廊",
  "Harvest Street": "丰收街",
  "High Street": "商业街",
  "Industrial Alleyways": "工业区小巷",
  "Industrial Drain": "工业区排水系统",
  Island: "岛屿",
  "Lake Depths": "湖泊深水区",
  "Lake Depths Ice": "结冰的湖泊深水区",
  "Lake Shallows": "湖泊浅水区",
  "Lake Shallows Ice": "结冰的湖泊浅水区",
  "Lake Underwater": "湖底",
  "Livestock Field": "雷米农场",
  Meadow: "草地",
  "Mer Street": "梅尔街",
  Moor: "荒原",
  "Nightingale Street": "南丁格尔街",
  "Ocean Breeze": "海风咖啡馆",
  Orphanage: "孤儿院",
  "Oxford Street": "牛津街",
  Park: "公园",
  "Prison Cell": "监狱牢房",
  "Residential Alleyways": "住宅区小巷",
  "Residential Drain": "住宅区排水系统",
  School: "学校",
  Sea: "海域",
  "Sea Beach": "海滩近海",
  "Sea Cliffs": "悬崖近海",
  "Sea Docks": "码头近海",
  "Sea Rocks": "礁石近海",
  "Starfish Street": "海星街",
  "Strip Club": "脱衣舞俱乐部",
  Temple: "神殿",
  Town: "城镇",
  "Underground Cell": "地下牢房",
  "Wolf Cave": "狼穴",
  "Wolf Cave Clearing": "狼穴空地",
  "Wolf Street": "狼街",
};

// DoL 0.5.11.9 中所有字面量 $location 值，以及 setup.locations
// 继承后可能写入 $location 的值。passage 是事件页时，用它确定稳定地区。
const GAME_LOCATION_NAMES = {
  adult_shop: "成人用品店",
  alex_cottage: "艾利克斯的小屋",
  alex_farm: "艾利克斯的农场",
  alley: "小巷",
  arcade: "游戏厅",
  asylum: "精神病院",
  avery_mansion: "艾弗里的庄园",
  avery_skyscraper: "艾弗里的摩天大楼",
  banner: "开始横幅",
  beach: "海滩",
  blitz: "大轰炸",
  bog: "沼泽",
  brothel: "妓院",
  cabin: "伊甸小屋",
  cafe: "咖啡馆",
  canal: "公寓运河",
  castle: "废弃城堡",
  chalets: "木屋",
  churchyard: "老教堂院子",
  coastpath: "沿海小径",
  commercial: "商业区",
  compound: "麋鹿街大院",
  compound_building: "大院建筑内部",
  dance_studio: "舞蹈室",
  dilapidated_shop: "破旧商店",
  docks: "码头",
  drain: "排水系统",
  estate: "雷米庄园",
  factory: "工厂",
  farm: "农田",
  farm_manors: "乡间庄园区",
  flats: "公寓",
  forest: "森林",
  forest_shop: "森林商店",
  forest_shop_garden: "森林商店花园",
  home: "孤儿院",
  hospital: "医院",
  hotel: "酒店",
  industrial: "工业区",
  island: "岛屿",
  kylar_manor: "凯拉尔庄园",
  kylarmanor_grounds: "凯拉尔庄园庭院",
  lake: "湖区",
  lake_office: "湖畔考古工作站",
  lake_ruin: "湖底遗迹",
  landfill: "垃圾填埋场",
  market: "市场",
  meadow: "草地",
  mines: "矿井",
  moor: "荒原",
  museum: "博物馆",
  night_monster_lair: "夜间怪物巢穴",
  oak: "橡树",
  office: "办公室",
  old_temple: "旧神殿",
  orphanage: "孤儿院",
  park: "公园",
  pirate_ship: "海盗船",
  police_station: "警察局",
  pool: "学校泳池",
  pound: "流浪狗收容所",
  prison: "监狱",
  prison_beach: "监狱外的秘密海滩",
  promenade: "海滨长廊",
  pub: "酒吧",
  riding_school: "雷米的骑术学校",
  school: "学校",
  school_rear_courtyard: "学校后操场",
  sea: "海域",
  sepulchre: "墓穴",
  sewers: "下水道",
  shopping_centre: "购物中心",
  shopping_centre_roof: "购物中心屋顶",
  spa: "水疗中心",
  strip_club: "脱衣舞俱乐部",
  studio: "摄影工作室",
  temple: "神殿",
  tentworld: "触手世界",
  tower: "鸟塔",
  town: "镇内",
  townhall: "市政厅",
  underground: "地下区域",
  wolf_cave: "狼穴",
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

export function localizeGameLocation(value) {
  const location = String(value || "").trim().toLowerCase();
  return location ? GAME_LOCATION_NAMES[location] || "" : "";
}

export function localizePassage(value, locationValue) {
  const passage = String(value || "").trim();
  if (!passage) return "未知场景";
  if (PASSAGE_NAMES[passage]) return PASSAGE_NAMES[passage];
  if (/^[\u3400-\u9fff]/u.test(passage)) return passage;
  const location = localizeGameLocation(locationValue);
  if (location) return location;
  return `未收录场景（原名：${passage}）`;
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
