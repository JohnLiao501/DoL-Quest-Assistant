import { decompressFromBase64 } from "./lz-string.js";

const OPERATIONS = {
  DELETE: 0,
  SPLICE_ARRAY: 1,
  COPY: 2,
  COPY_DATE: 3,
};

function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function patchDelta(original, delta) {
  const patched = clone(original);
  for (const key of Object.keys(delta || {})) {
    const value = delta[key];
    if (value === OPERATIONS.DELETE) {
      delete patched[key];
    } else if (Array.isArray(value)) {
      switch (value[0]) {
        case OPERATIONS.SPLICE_ARRAY:
          patched.splice(value[1], value[2] - value[1] + 1);
          break;
        case OPERATIONS.COPY:
          patched[key] = clone(value[1]);
          break;
        case OPERATIONS.COPY_DATE:
          patched[key] = new Date(value[1]);
          break;
        default:
          throw new Error(`遇到未知的 SugarCube 差量操作：${value[0]}`);
      }
    } else {
      patched[key] = patchDelta(patched[key], value);
    }
  }
  return patched;
}

export function decodeHistory(delta) {
  if (!Array.isArray(delta) || !delta.length) return [];
  const history = [clone(delta[0])];
  for (let index = 1; index < delta.length; index += 1) {
    history.push(patchDelta(history[index - 1], delta[index]));
  }
  return history;
}

function tryDecodeJson(blob) {
  try {
    const decompressed = decompressFromBase64(blob);
    if (!decompressed) return null;
    return JSON.parse(decompressed);
  } catch {
    return null;
  }
}

function isSaveObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      value.state &&
      (Array.isArray(value.state.delta) || Array.isArray(value.state.history)),
  );
}

export function decodeSaveObject(rawText) {
  const raw = String(rawText || "").trim();
  if (!raw) throw new Error("存档文件为空。\n请选择游戏导出的 .save 文件。");

  const whole = tryDecodeJson(raw);
  if (isSaveObject(whole)) return whole;

  const candidateOffsets = [];
  let cursor = raw.indexOf("N4I", 1);
  while (cursor !== -1) {
    candidateOffsets.push(cursor);
    cursor = raw.indexOf("N4I", cursor + 1);
  }

  for (let index = candidateOffsets.length - 1; index >= 0; index -= 1) {
    const save = tryDecodeJson(raw.slice(0, candidateOffsets[index]));
    if (isSaveObject(save)) return save;
  }

  throw new Error("无法识别这份存档。请使用游戏内“保存到磁盘”导出的 .save 文件。");
}

export function parseDoLSaveText(rawText, fileName = "未知存档.save") {
  const save = decodeSaveObject(rawText);
  if (save.id && save.id !== "degrees-of-lewdity") {
    throw new Error(`这不是《欲都孤儿》存档（检测到的游戏标识：${save.id}）。`);
  }

  const state = save.state || {};
  const history = Array.isArray(state.history) ? state.history : decodeHistory(state.delta);
  const currentIndex = Math.min(Math.max(Number(state.index || 0), 0), Math.max(history.length - 1, 0));
  const moment = history[currentIndex];
  if (!moment?.variables) throw new Error("存档中没有可读取的当前状态。");

  const variables = moment.variables;
  const profileName = variables.saveName || "未命名角色";
  const profileKey = `${profileName}:${variables.startDate || "unknown"}`;

  return {
    fileName,
    gameId: save.id || "degrees-of-lewdity",
    gameVersion: state.loadedVersion || variables.saveVersion || variables.version || "未知",
    passage: moment.title || variables.passage || "未知",
    historyIndex: currentIndex,
    historyLength: history.length,
    profileName,
    profileKey,
    variables,
  };
}
