import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function declarations(file, selector) {
  const css = readFileSync(new URL(file, import.meta.url), "utf8").replaceAll("\r\n", "\n");
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, selector);
  const block = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, key, value]) => [key, value.trim()]));
}
function color(tokens, key) {
  const value = tokens[key];
  assert.ok(value, key);
  const reference = value.match(/^var\(--([\w-]+)\)$/);
  return reference ? color(tokens, reference[1]) : value.toLowerCase();
}
function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map(value => Number.parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
const light = declarations("../app/theme.css", ':root[data-theme="light"]');
const themes = [
  ["light", light],
  ["dark", { ...light, ...declarations("../app/theme.css", ':root[data-theme="dark"]') }],
  ["system dark", { ...light, ...declarations("../app/theme.css", ":root:not([data-theme])") }],
];

for (const [name, tokens] of themes) {
  test(`${name}: public green actions retain readable text and distinguishable keyboard focus`, () => {
    assert.equal(color(tokens, "accent"), "#006338");
    for (const surface of ["accent", "action-hover"]) {
      assert.ok(contrast(color(tokens, "action-text"), color(tokens, surface)) >= 4.5, `${name} ${surface} text contrast`);
    }
    for (const surface of ["background", "surface", "status-soft"]) {
      assert.ok(contrast(color(tokens, "accent-ink"), color(tokens, surface)) >= 4.5, `${name} link on ${surface}`);
    }
    assert.ok(contrast(color(tokens, "focus-ring"), color(tokens, "surface")) >= 3, `${name} focus contrast`);
    assert.ok(contrast(color(tokens, "action-border"), color(tokens, "surface")) >= 3, `${name} action boundary`);
  });
}

test("Admin retains its independent monochrome palette rather than inheriting public accents", () => {
  const adminLight = declarations("../components/admin/admin-theme.module.css", ".scope");
  for (const [selector, expected] of [[null, "#171717"], ['.scope[data-admin-theme="dark"]', "#f5f5f5"], ['.scope[data-admin-theme="system"]', "#f5f5f5"]]) {
    const tokens = { ...adminLight, ...(selector ? declarations("../components/admin/admin-theme.module.css", selector) : {}) };
    for (const key of ["accent", "accent-ink", "action-border", "focus-ring", "action-hover"]) assert.equal(color(tokens, key), expected);
  }
});
