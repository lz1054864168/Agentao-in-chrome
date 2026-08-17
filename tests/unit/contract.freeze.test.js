// Freeze test: guard against accidental removal or rename of contract
// constants. When you intentionally change the contract, update this test
// alongside agentao-contract.js and native-host/host_protocol.py.
//
// Pattern from claw-in-chrome's deobfuscation-anchors.regression.test.js:
// pin the known set of keys so a refactor that drops one fails loudly.

const assert = require("node:assert");
const { loadContract } = require("../helpers/load-contract");

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

// ── Contract loads and is frozen ──────────────────────────────────────

test("contract is loaded and frozen", () => {
  assert.ok(contract, "contract must be truthy");
  assert.ok(Object.isFrozen(contract), "contract must be frozen");
  assert.strictEqual(contract.version, 1);
});

// ── nativeMessaging ───────────────────────────────────────────────────

test("nativeMessaging has required keys", () => {
  const nm = contract.nativeMessaging;
  assert.strictEqual(nm.HOST_NAME, "com.agentao.chrome_extension");
  assert.strictEqual(typeof nm.BINDING_TYPE, "string");
  assert.strictEqual(nm.BINDING_PROTOCOL_VERSION, 1);
  assert.strictEqual(typeof nm.BINDING_INSTANCE_ID_STORAGE_KEY, "string");
});

// ── provider ──────────────────────────────────────────────────────────

test("provider has required keys and fields", () => {
  const p = contract.provider;
  assert.ok(p.STORAGE_KEY, "STORAGE_KEY required");
  assert.ok(p.ACTIVE_PROFILE_STORAGE_KEY);
  assert.ok(p.PROFILES_STORAGE_KEY);
  const f = p.FIELDS;
  for (const key of ["ID", "NAME", "FORMAT", "BASE_URL", "API_KEY", "MODEL", "VISION"]) {
    assert.ok(f[key], `FIELDS.${key} required`);
  }
  assert.ok(p.FORMATS.OPENAI);
  assert.ok(p.FORMATS.ANTHROPIC);
});

// ── permission ────────────────────────────────────────────────────────

test("permission has four modes", () => {
  const m = contract.permission.MODES;
  assert.strictEqual(m.READ_ONLY, "read-only");
  assert.strictEqual(m.WORKSPACE_WRITE, "workspace-write");
  assert.strictEqual(m.FULL_ACCESS, "full-access");
  assert.strictEqual(m.PLAN, "plan");
  assert.ok(contract.permission.MODE_STORAGE_KEY);
});

// ── messages ──────────────────────────────────────────────────────────

test("messages has required types", () => {
  const m = contract.messages;
  const required = [
    "PANEL_OPENED",
    "PANEL_CLOSED",
    "CHAT_SEND",
    "CHAT_CANCEL",
    "CHAT_EVENT",
    "CHAT_TURN_END",
    "CHAT_ERROR",
    "PERMISSION_REQUEST",
    "PERMISSION_RESPONSE",
    "ASK_USER_REQUEST",
    "ASK_USER_RESPONSE",
    "GET_HOST_STATUS",
    "HOST_STATUS_CHANGED",
    "HOST_CONNECTING",
    "HOST_CONNECTED",
    "HOST_DISCONNECTED",
    "HOST_ERROR",
    "CONFIG_UPDATED",
    "STOP_AGENT",
  ];
  for (const key of required) {
    assert.ok(m[key], `messages.${key} required`);
  }
});

// ── host (native messaging wire types) ───────────────────────────────

test("host has required wire types", () => {
  const h = contract.host;
  const extToHost = [
    "BINDING_HELLO",
    "CHAT",
    "CHAT_CANCEL",
    "CONFIG",
    "PERMISSION_RESPONSE",
    "ASK_USER_RESPONSE",
    "SHUTDOWN",
  ];
  for (const key of extToHost) {
    assert.ok(h[key], `host.${key} required`);
  }
  const hostToExt = [
    "READY",
    "CHAT_EVENT",
    "TURN_END",
    "ERROR",
    "PERMISSION_REQUEST",
    "ASK_USER_REQUEST",
    "LOG",
  ];
  for (const key of hostToExt) {
    assert.ok(h[key], `host.${key} required`);
  }
});

// ── agentEvents ───────────────────────────────────────────────────────

test("agentEvents mirrors agentao EventType", () => {
  const e = contract.agentEvents;
  const required = [
    "TURN_START",
    "TURN_END",
    "TOOL_START",
    "TOOL_OUTPUT",
    "TOOL_COMPLETE",
    "TOOL_RESULT",
    "THINKING",
    "LLM_TEXT",
    "ERROR",
    "AGENT_START",
    "AGENT_END",
  ];
  for (const key of required) {
    assert.ok(e[key], `agentEvents.${key} required`);
  }
  // Spot-check a few values match agentao's EventType enum
  assert.strictEqual(e.TURN_START, "turn_start");
  assert.strictEqual(e.TOOL_START, "tool_start");
  assert.strictEqual(e.LLM_TEXT, "llm_text");
});

// ── dom ───────────────────────────────────────────────────────────────

test("dom has required IDs", () => {
  const d = contract.dom;
  for (const key of [
    "SIDEPANEL_ROOT",
    "SIDEPANEL_MESSAGES",
    "SIDEPANEL_INPUT",
    "SIDEPANEL_SEND_BUTTON",
    "SIDEPANEL_STOP_BUTTON",
    "SIDEPANEL_STATUS",
    "SIDEPANEL_PERMISSION_PROMPT",
    "SIDEPANEL_ASK_USER_PROMPT",
    "SIDEPANEL_ATTACH_BUTTON",
    "SIDEPANEL_FILE_INPUT",
    "SIDEPANEL_ATTACHMENTS",
    "OPTIONS_ROOT",
  ]) {
    assert.ok(d[key], `dom.${key} required`);
  }
});

// ── session / ui ──────────────────────────────────────────────────────

test("session has required keys", () => {
  const s = contract.session;
  assert.ok(s.ACTIVE_SESSION_ID_STORAGE_KEY);
  assert.ok(s.WORKING_DIRECTORY_STORAGE_KEY);
  assert.ok(s.HISTORY_KEY_PREFIX);
  assert.ok(typeof s.HISTORY_LIMIT === "number");
});

test("ui has required keys and themes", () => {
  const u = contract.ui;
  assert.ok(u.PREFERRED_LOCALE_STORAGE_KEY);
  assert.ok(u.THEME_STORAGE_KEY);
  assert.ok(u.DEBUG_MODE_STORAGE_KEY);
  assert.strictEqual(u.THEMES.LIGHT, "light");
  assert.strictEqual(u.THEMES.DARK, "dark");
  assert.strictEqual(u.THEMES.AUTO, "auto");
});

console.log("contract.freeze.test.js passed");
