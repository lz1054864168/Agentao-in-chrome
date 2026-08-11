// Verify the message protocol is internally consistent:
// - Every message type used in sidepanel.js / options.js / service-worker-runtime.js
//   exists in the contract.
// - The host-side host_protocol.py mirrors the contract's host.* types.
//
// This is a static analysis test: it greps the source files for
// MSG.XXX / HOST.XXX references and checks they exist in the contract.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { loadContract, PROJECT_ROOT } = require("../helpers/load-contract");

const contract = loadContract();

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

function readSource(relativePath) {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf-8");
}

// ── sidepanel.js only references MSG.* keys that exist ───────────────

test("sidepanel.js references only valid MSG keys", () => {
  const src = readSource("sidepanel.js");
  const refs = [...src.matchAll(/MSG\.([A-Z_]+)/g)].map((m) => m[1]);
  const unique = [...new Set(refs)];
  const missing = unique.filter((k) => !contract.messages[k]);
  assert.deepStrictEqual(missing, [], `sidepanel.js references unknown MSG keys: ${missing.join(", ")}`);
});

test("sidepanel.js references only valid agentEvents keys", () => {
  const src = readSource("sidepanel.js");
  const refs = [...src.matchAll(/EVENTS\.([A-Z_]+)/g)].map((m) => m[1]);
  const unique = [...new Set(refs)];
  const missing = unique.filter((k) => !contract.agentEvents[k]);
  assert.deepStrictEqual(missing, [], `sidepanel.js references unknown agentEvents keys: ${missing.join(", ")}`);
});

// ── service-worker-runtime.js references valid MSG and HOST keys ─────

test("service-worker-runtime.js references only valid MSG keys", () => {
  const src = readSource("service-worker-runtime.js");
  const refs = [...src.matchAll(/MSG\.([A-Z_]+)/g)].map((m) => m[1]);
  const unique = [...new Set(refs)];
  const missing = unique.filter((k) => !contract.messages[k]);
  assert.deepStrictEqual(missing, [], `service-worker-runtime.js references unknown MSG keys: ${missing.join(", ")}`);
});

test("service-worker-runtime.js references only valid HOST keys", () => {
  const src = readSource("service-worker-runtime.js");
  const refs = [...src.matchAll(/HOST\.([A-Z_]+)/g)].map((m) => m[1]);
  const unique = [...new Set(refs)];
  const missing = unique.filter((k) => !contract.host[k]);
  assert.deepStrictEqual(missing, [], `service-worker-runtime.js references unknown HOST keys: ${missing.join(", ")}`);
});

// ── options.js references valid MSG keys ─────────────────────────────

test("options.js references only valid MSG keys", () => {
  const src = readSource("options.js");
  const refs = [...src.matchAll(/MSG\.([A-Z_]+)/g)].map((m) => m[1]);
  const unique = [...new Set(refs)];
  const missing = unique.filter((k) => !contract.messages[k]);
  assert.deepStrictEqual(missing, [], `options.js references unknown MSG keys: ${missing.join(", ")}`);
});

// ── host_protocol.py mirrors contract.host ───────────────────────────

test("host_protocol.py EXT_TO_HOST mirrors contract.host ext->host types", () => {
  const src = readSource("native-host/host_protocol.py");
  const contractTypes = Object.values(contract.host).filter((v) =>
    // ext->host types are lowercase snake_case
    /^[a-z_]+$/.test(v)
  );
  // Every ext->host wire type from the contract must appear in host_protocol.py
  for (const t of contractTypes) {
    assert.ok(
      src.includes(`"${t}"`),
      `host_protocol.py must define wire type "${t}"`
    );
  }
});

test("host_protocol.py HOST_NAME matches contract", () => {
  const src = readSource("native-host/host_protocol.py");
  assert.ok(
    src.includes(`HOST_NAME = "${contract.nativeMessaging.HOST_NAME}"`),
    "host_protocol.py HOST_NAME must match contract.nativeMessaging.HOST_NAME"
  );
});

test("host_protocol.py defines all permission modes", () => {
  const src = readSource("native-host/host_protocol.py");
  for (const mode of Object.values(contract.permission.MODES)) {
    assert.ok(
      src.includes(`"${mode}"`),
      `host_protocol.py must define permission mode "${mode}"`
    );
  }
});

test("host_protocol.py defines all provider fields", () => {
  const src = readSource("native-host/host_protocol.py");
  for (const field of Object.values(contract.provider.FIELDS)) {
    assert.ok(
      src.includes(`"${field}"`),
      `host_protocol.py must define provider field "${field}"`
    );
  }
});

// ── native_host.py references valid host protocol types ──────────────

test("native_host.py uses HOST_TO_EXT and EXT_TO_HOST consistently", () => {
  const src = readSource("native-host/native_host.py");
  // Every HOST_TO_EXT["..."] reference must use a key that exists
  const refs = [...src.matchAll(/HOST_TO_EXT\["([^"]+)"\]/g)].map((m) => m[1]);
  const unique = [...new Set(refs)];
  const validKeys = new Set([
    "ready", "chat_event", "turn_end", "error",
    "permission_request", "ask_user_request", "log", "llm_status",
  ]);
  const missing = unique.filter((k) => !validKeys.has(k));
  assert.deepStrictEqual(missing, [], `native_host.py references unknown HOST_TO_EXT keys: ${missing.join(", ")}`);
});

console.log("message-protocol.test.js passed");
