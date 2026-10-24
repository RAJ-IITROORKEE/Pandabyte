import assert from "node:assert/strict";
import test from "node:test";
import { pointerToCircuitPlane } from "./home-circuit-geometry.ts";

test("inverts a resized, rotated perspective plane back to circuit coordinates", () => {
  const matrix = { m11: 0.7, m12: 0.1, m13: 0.2, m21: -0.15, m22: 0.8, m23: -0.25 };
  const perspective = 1500;
  const point = { x: 120, y: -80 };
  const z = matrix.m13 * point.x + matrix.m23 * point.y;
  const clientX = 180 + 400 + (matrix.m11 * point.x + matrix.m21 * point.y) / (1 - z / perspective);
  const clientY = 70 + 275 + (matrix.m12 * point.x + matrix.m22 * point.y) / (1 - z / perspective);

  const actual = pointerToCircuitPlane(clientX, clientY, { left: 180, top: 70, width: 800, height: 550 }, matrix, perspective);
  assert.ok(Math.abs(actual.x - 570) < 0.001);
  assert.ok(Math.abs(actual.y - 230) < 0.001);
});

test("returns the center when the projected plane cannot be inverted", () => {
  assert.deepEqual(
    pointerToCircuitPlane(400, 300, { left: 0, top: 0, width: 800, height: 600 }, { m11: 0, m12: 0, m13: 1, m21: 0, m22: 0, m23: 1 }, 1500),
    { x: 450, y: 310 },
  );
});
