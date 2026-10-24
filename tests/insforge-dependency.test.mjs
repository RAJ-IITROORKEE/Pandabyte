import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createClient } from "@insforge/sdk";

// Remove the scoped override when InsForge ships patched compatible schemas.
// Only the SDK's constants/enum contract is supported, not direct schema parsing.
test("patched Zod retains the InsForge SDK runtime contract", async () => {
  const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
  assert.equal(lock.packages["node_modules/@insforge/sdk"].version, "1.5.2", "Re-review the workaround on SDK upgrades");
  assert.equal(lock.packages["node_modules/@insforge/shared-schemas"].version, "1.2.1");
  const zodPackages = Object.entries(lock.packages).filter(([name]) => name.endsWith("node_modules/zod"));
  assert.ok(zodPackages.length > 0);
  for (const [, entry] of zodPackages) assert.equal(entry.version, "4.6.7");

  const sdkEntry = import.meta.resolve("@insforge/sdk");
  const source = await readFile(fileURLToPath(sdkEntry), "utf8");
  const imports = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']@insforge\/shared-schemas["']/g)];
  assert.equal(imports.length, 1, "Re-review any changed shared-schema imports");
  assert.deepEqual(imports[0][1].split(",").map((value) => value.trim()).sort(), ["ERROR_CODES", "oAuthProvidersSchema"]);

  const schemas = await import("@insforge/shared-schemas");
  assert.ok(schemas.ERROR_CODES);
  assert.equal(schemas.oAuthProvidersSchema._zod?.version?.major, 4, "The legacy /v3 entry point is not patched");
  assert.deepEqual(schemas.oAuthProvidersSchema.options, ["google", "github", "discord", "linkedin", "facebook", "instagram", "tiktok", "apple", "x", "spotify", "microsoft"]);
  assert.equal(schemas.oAuthProvidersSchema.safeParse("google").success, true);
  assert.equal(schemas.oAuthProvidersSchema.safeParse("untrusted-provider").success, false);
  const oversized = schemas.oAuthProvidersSchema.array().max(1).safeParse(Array(32).fill("untrusted-provider"));
  assert.equal(oversized.success, false);
  assert.equal(oversized.error.issues.length, 1, "Reject oversized arrays before accumulating per-element errors");
  assert.equal(oversized.error.issues[0].code, "too_big");
  const client = createClient({ baseUrl: "https://example.invalid", accessToken: "test-only", isServerMode: true });
  assert.equal(typeof client.database.rpc, "function");
  assert.equal(typeof client.storage.from, "function");
  // SSR entry must also remain importable with the scoped runtime override.
  const sdkPackage = JSON.parse(await readFile(join(dirname(fileURLToPath(sdkEntry)), "..", "package.json"), "utf8"));
  if (sdkPackage.exports?.["./ssr"]) assert.ok(await import("@insforge/sdk/ssr"));
});
