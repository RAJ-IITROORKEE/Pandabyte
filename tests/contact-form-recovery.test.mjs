import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/editorial/contact-form.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;

function harness() {
  const slots = [];
  let index = 0, nextId = 0, rejectRequest;
  const requests = [], deadlines = [], exports = {};
  const react = {
    useRef: initial => {
      const i = index++;
      return slots[i] ??= { current: initial };
    },
    useState: initial => {
      const i = index++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }];
    },
  };
  const dependencies = { react, "lucide-react": { Send: () => null, Paperclip: () => null, X: () => null }, "@/components/ui/button": { buttonClassName: () => "button" }, "./editorial.module.css": { default: {} } };
  const signal = {};
  runInNewContext(compiled, {
    exports, require: name => dependencies[name] ?? require(name),
    crypto: { randomUUID: () => `request-${++nextId}` },
    AbortSignal: { timeout: ms => { deadlines.push(ms); return signal; } },
    FormData: class { constructor(form) { this.form = form; } get(name) { return this.form.values[name]; } },
    fetch: (_url, options) => {
      requests.push(options);
      return new Promise((resolve, reject) => { rejectRequest = reject; requests.at(-1).resolve = resolve; });
    },
  });
  function render() {
    index = 0;
    return exports.ContactForm();
  }
  const form = { values: { name: "Name", email: "test@example.com", phone: "", subject: "Subject", message: "Message" }, resets: 0, reset() { this.resets++; } };
  function submit() { return render().props.onSubmit({ preventDefault() {}, currentTarget: form }); }
  return { requests, deadlines, signal, form, render, submit, abort: () => rejectRequest(new DOMException("Timeout", "TimeoutError")) };
}

test("timed-out inquiry remains retryable with its original ID; edits and success start a new request", async () => {
  const h = harness();
  const first = h.submit();
  assert.equal(h.deadlines[0], 30_000);
  assert.equal(h.requests[0].signal, h.signal);
  assert.equal(h.render().props["aria-busy"], true);
  h.abort();
  await first;
  assert.equal(h.render().props["aria-busy"], false);
  assert.equal(h.form.resets, 0);
  assert.match(h.render().props.children.at(-1).props.children[0].props.children, /could not confirm/i);
  const retry = h.submit();
  const id = JSON.parse(h.requests[0].body).idempotencyKey;
  assert.equal(JSON.parse(h.requests[1].body).idempotencyKey, id);
  assert.equal("challengeToken" in JSON.parse(h.requests[1].body), false);
  h.abort();
  await retry;
  h.render().props.onChange();
  const edited = h.submit();
  assert.notEqual(JSON.parse(h.requests[2].body).idempotencyKey, id);
  h.requests[2].resolve({ ok: true, json: async () => ({ receipt: "00000000-0000-4000-8000-000000000001" }) });
  await edited;
  assert.equal(h.form.resets, 1);
  const afterSuccess = h.submit();
  assert.notEqual(JSON.parse(h.requests[3].body).idempotencyKey, JSON.parse(h.requests[2].body).idempotencyKey);
  h.abort();
  await afterSuccess;
});
