import assert from "node:assert/strict";
import test from "node:test";
import { decodeHistory, patchDelta } from "../src/lib/save-parser.js";

test("SugarCube Copy、Delete 和嵌套 patch 能正确应用", () => {
  const original = { name: "before", keep: true, remove: 1, nested: { score: 2 } };
  const delta = {
    name: [2, "after"],
    remove: 0,
    nested: { score: [2, 9], extra: [2, "ok"] },
  };
  assert.deepEqual(patchDelta(original, delta), {
    name: "after",
    keep: true,
    nested: { score: 9, extra: "ok" },
  });
});

test("SugarCube 数组 splice 差量能正确应用", () => {
  const original = ["a", "b", "c", "d"];
  assert.deepEqual(patchDelta(original, { "~": [1, 1, 2] }), ["a", "d"]);
});

test("delta history 会逐帧解码", () => {
  const history = decodeHistory([
    { title: "A", variables: { score: 1 } },
    { title: [2, "B"], variables: { score: [2, 2] } },
  ]);
  assert.equal(history[1].title, "B");
  assert.equal(history[1].variables.score, 2);
});
