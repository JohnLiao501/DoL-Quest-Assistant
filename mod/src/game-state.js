function resolveState(scope) {
  return scope?.SugarCube?.State || scope?.State || null;
}

const PRE_GAME_PASSAGES = new Set(["Start", "Start2"]);

function passageName(value) {
  return typeof value === "string" ? value : value?.title || "未知";
}

export function isActiveGameState(variables, passage) {
  if (!variables) return false;
  if (variables.intro === 1) return false;
  return !PRE_GAME_PASSAGES.has(passageName(passage));
}

export function getGameVariables(scope = globalThis) {
  return scope?.V || resolveState(scope)?.variables || null;
}

export function readCurrentGameState(scope = globalThis) {
  const variables = getGameVariables(scope);
  if (!variables) return null;

  const state = resolveState(scope);
  const passage = state?.passage
    || scope?.passage?.()
    || variables.passage
    || "未知";
  if (!isActiveGameState(variables, passage)) return null;

  return {
    fileName: "当前游戏存档",
    gameId: "degrees-of-lewdity",
    gameVersion: variables.saveVersion
      || variables.version
      || scope?.dolVersion
      || "0.5.11.9",
    passage: passageName(passage),
    profileName: variables.saveName || variables.name || "未命名角色",
    profileKey: `${variables.saveName || variables.name || "未命名角色"}:${variables.startDate || "unknown"}`,
    variables,
  };
}

export function readManualOverrides(scope = globalThis) {
  const value = getGameVariables(scope)?.dolQuestAssistant?.manualOverrides;
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...value }
    : {};
}

export function writeManualOverrides(overrides, scope = globalThis) {
  const variables = getGameVariables(scope);
  if (!variables) throw new Error("尚未检测到可写入的当前存档。");

  const current = variables.dolQuestAssistant;
  variables.dolQuestAssistant = current && typeof current === "object" && !Array.isArray(current)
    ? current
    : {};
  variables.dolQuestAssistant.manualOverrides = { ...overrides };
  variables.dolQuestAssistant.schemaVersion = 1;
  return variables.dolQuestAssistant.manualOverrides;
}
