import assert from "node:assert/strict";
import test from "node:test";
import {
  getGameVariables,
  isActiveGameState,
  readCurrentGameState,
  readManualOverrides,
  writeManualOverrides,
} from "../mod/src/game-state.js";

test("优先读取游戏提供的 V，并生成任务分析需要的存档结构", () => {
  const scope = {
    V: { saveName: "测试角色", startDate: "2026-08-25", saveVersion: "0.5.11.9" },
    State: { passage: "Town", variables: { saveName: "不应读取" } },
  };
  assert.equal(getGameVariables(scope), scope.V);
  assert.deepEqual(readCurrentGameState(scope), {
    fileName: "当前游戏存档",
    gameId: "degrees-of-lewdity",
    gameVersion: "0.5.11.9",
    passage: "Town",
    profileName: "测试角色",
    profileKey: "测试角色:2026-08-25",
    variables: scope.V,
  });
});

test("V 不存在时回退到 SugarCube.State.variables", () => {
  const variables = { name: "回退角色" };
  const scope = { SugarCube: { State: { passage: "Farm", variables } } };
  assert.equal(getGameVariables(scope), variables);
  assert.equal(readCurrentGameState(scope).passage, "Farm");
  assert.equal(readCurrentGameState(scope).profileName, "回退角色");
});

test("人工确认只写入命名空间，不改动原任务变量", () => {
  const variables = { farm_stage: 4 };
  const scope = { V: variables };
  writeManualOverrides({ "farm-restoration": true }, scope);
  assert.equal(variables.farm_stage, 4);
  assert.deepEqual(readManualOverrides(scope), { "farm-restoration": true });
  assert.equal(variables.dolQuestAssistant.schemaVersion, 1);
});

test("未进入游戏时返回空状态", () => {
  assert.equal(readCurrentGameState({}), null);
  assert.deepEqual(readManualOverrides({}), {});
});

test("游戏首页的临时角色变量不会被误判为已加载存档", () => {
  const scope = {
    V: { intro: 1, saveName: "", farm_stage: 0 },
    State: { passage: "Start", variables: {} },
  };
  assert.equal(isActiveGameState(scope.V, "Start"), false);
  assert.equal(readCurrentGameState(scope), null);
});

test("开始引导页结束前不显示任务，进入实际场景后正常识别", () => {
  const variables = { intro: 0, saveName: "新角色", startDate: 123 };
  assert.equal(isActiveGameState(variables, "Start2"), false);
  assert.equal(readCurrentGameState({ V: variables, State: { passage: "Start2" } }), null);
  assert.equal(isActiveGameState(variables, "Orphanage Intro"), true);
  assert.equal(readCurrentGameState({ V: variables, State: { passage: "Orphanage Intro" } }).profileName, "新角色");
});
