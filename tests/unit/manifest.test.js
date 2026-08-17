// Validate manifest.json structure and consistency with the contract.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { loadContract, readJson, fileExists, PROJECT_ROOT, EXTENSION_ROOT } = require("../helpers/load-contract");

const contract = loadContract();
const manifest = readJson("manifest.json");

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

test("manifest is MV3", () => {
  assert.strictEqual(manifest.manifest_version, 3);
});

test("manifest name matches project", () => {
  assert.strictEqual(manifest.name, "Agentao in Chrome");
});

test("manifest version is a valid semver", () => {
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
});

test("manifest references service-worker-loader.js", () => {
  assert.strictEqual(manifest.background.service_worker, "service-worker-loader.js");
  assert.strictEqual(manifest.background.type, "module");
});

test("manifest side_panel points to sidepanel.html", () => {
  assert.strictEqual(manifest.side_panel.default_path, "sidepanel.html");
});

test("manifest options_page points to options.html", () => {
  assert.strictEqual(manifest.options_page, "options.html");
});

test("manifest has nativeMessaging permission", () => {
  assert.ok(
    manifest.permissions.includes("nativeMessaging"),
    "nativeMessaging permission required for connectNative"
  );
});

test("manifest has sidePanel permission", () => {
  assert.ok(
    manifest.permissions.includes("sidePanel"),
    "sidePanel permission required for the sidebar"
  );
});

test("manifest has storage permission", () => {
  assert.ok(
    manifest.permissions.includes("storage"),
    "storage permission required for chrome.storage.local"
  );
});

test("manifest host_permissions includes all_urls", () => {
  assert.ok(
    manifest.host_permissions.includes("<all_urls>"),
    "host_permissions must include <all_urls> for fetch in options test"
  );
});

test("manifest default_locale matches _locales directory", () => {
  assert.strictEqual(manifest.default_locale, "en");
  assert.ok(
    fs.existsSync(path.join(EXTENSION_ROOT, "_locales", "en", "messages.json")),
    "_locales/en/messages.json must exist"
  );
});

test("manifest icon file exists", () => {
  assert.ok(fileExists("icon-128.png"), "icon-128.png must exist");
});

test("manifest CSP allows native messaging", () => {
  const csp = manifest.content_security_policy.extension_pages;
  assert.ok(csp.includes("connect-src"), "CSP must have connect-src directive");
  // Native messaging doesn't need connect-src (it's not a network call),
  // but the options page fetch() for test connection does.
  assert.ok(csp.includes("https:"), "CSP must allow https for provider test");
});

test("all referenced source files exist", () => {
  const refs = [
    "service-worker-loader.js",
    "sidepanel.html",
    "sidepanel.js",
    "sidepanel.css",
    "options.html",
    "options.js",
    "options.css",
    "agentao-contract.js",
    "theme-init.js",
    "native-host-binding.js",
    "service-worker-runtime.js",
  ];
  for (const ref of refs) {
    assert.ok(fileExists(ref), `${ref} must exist (referenced by manifest or loader)`);
  }
});

console.log("manifest.test.js passed");
