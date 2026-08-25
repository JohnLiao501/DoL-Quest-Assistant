import test from "node:test";
import assert from "node:assert/strict";
import {
  localizeAveryFate,
  localizeEscapeRoute,
  localizeGameLocation,
  localizeKnownTerms,
  localizePassage,
  localizePlayRole,
  localizeTempleRank,
  localizeWikiTitle,
  localizeWraithState,
} from "../src/lib/localization.js";

test("存档中的常见英文枚举值会显示为中文", () => {
  assert.equal(localizePassage("Forest"), "森林");
  assert.equal(localizeTempleRank("monk"), "修士");
  assert.equal(localizeWraithState("despair"), "绝望");
  assert.equal(localizeEscapeRoute("night"), "夜间逃脱");
  assert.equal(localizeAveryFate("saved"), "已获救");
  assert.equal(localizePlayRole("Cass"), "卡斯");
});

test("0.5.11.9 城市地图与地点枢纽 passage 会使用游戏汉化名", () => {
  const locations = {
    "Barb Street": "倒钩街",
    "Cliff Street": "峭壁街",
    "Commercial Alleyways": "商业街小巷",
    "Connudatus Street": "康努达塔斯街",
    "Danube Street": "多瑙河街",
    "Domus Street": "宅邸街",
    "Elk Street": "麋鹿街",
    "Harvest Street": "丰收街",
    "High Street": "商业街",
    "Industrial Alleyways": "工业区小巷",
    "Mer Street": "梅尔街",
    "Nightingale Street": "南丁格尔街",
    "Oxford Street": "牛津街",
    Park: "公园",
    "Residential Alleyways": "住宅区小巷",
    "Starfish Street": "海星街",
    "Wolf Street": "狼街",
  };

  for (const [passage, localized] of Object.entries(locations)) {
    assert.equal(localizePassage(passage), localized, passage);
  }
});

test("未收录的 passage 会保留原名供场景核验", () => {
  assert.equal(localizePassage("Custom Mod Passage"), "未收录场景（原名：Custom Mod Passage）");
  assert.equal(localizePassage("自定义场景"), "自定义场景");
  assert.equal(localizePassage("   "), "未知场景");
});

test("0.5.11.9 的全部地区变量都有中文名称", () => {
  // 游戏本体中所有字面量 $location 值，与 setup.locations 继承后可能写入
  // $location 的值之并集；大小写差异 Underground 会归一化处理。
  const locations = [
    "Underground", "adult_shop", "alex_cottage", "alex_farm", "alley", "arcade",
    "asylum", "avery_mansion", "avery_skyscraper", "banner", "beach", "blitz", "bog",
    "brothel", "cabin", "cafe", "canal", "castle", "chalets", "churchyard", "coastpath",
    "commercial", "compound", "compound_building", "dance_studio", "dilapidated_shop",
    "docks", "drain", "estate", "factory", "farm", "farm_manors", "flats", "forest",
    "forest_shop", "forest_shop_garden", "home", "hospital", "hotel", "industrial", "island",
    "kylar_manor", "kylarmanor_grounds", "lake", "lake_office", "lake_ruin", "landfill",
    "market", "meadow", "mines", "moor", "museum", "night_monster_lair", "oak", "office",
    "old_temple", "orphanage", "park", "pirate_ship", "police_station", "pool", "pound",
    "prison", "prison_beach", "promenade", "pub", "riding_school", "school",
    "school_rear_courtyard", "sea", "sepulchre", "sewers", "shopping_centre",
    "shopping_centre_roof", "spa", "strip_club", "studio", "temple", "tentworld", "tower",
    "town", "townhall", "underground", "wolf_cave",
  ];

  assert.equal(locations.length, 84);
  for (const location of locations) {
    assert.notEqual(localizeGameLocation(location), "", location);
  }
});

test("事件 passage 未单独登记时会使用稳定地区变量，不再误报未收录", () => {
  assert.equal(localizePassage("Meadow Relax", "meadow"), "草地");
  assert.equal(localizePassage("Lake Office Volunteers", "lake_office"), "湖畔考古工作站");
  assert.equal(localizePassage("Custom Mod Passage", "custom_mod_location"), "未收录场景（原名：Custom Mod Passage）");
});

test("中文攻略摘要中的已知英文人名会按 Wiki 译名替换", () => {
  assert.equal(
    localizeKnownTerms("Sydney 与 Jordan 谈论 Alex 和 Quinn。"),
    "悉尼 与 约旦 谈论 艾利克斯 和 奎恩。",
  );
  assert.equal(localizeWikiTitle("Tenyclus"), "街机游戏最终事件");
  assert.equal(
    localizeKnownTerms("（Cafe Campaign）咖啡馆任务。本页取自enwiki，版本0.4.3.3-chs-alpha2.5.0"),
    "咖啡馆任务。本页译自英文攻略站，内容对应较早的汉化版本。",
  );
});
