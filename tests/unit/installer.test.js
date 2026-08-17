// Test the installer module: manifest building, platform paths, and
// that install_host() produces a valid manifest. Runs the Python
// installer.py in a subprocess with a temp HOME so we don't pollute
// the real NativeMessagingHosts directory.

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { PROJECT_ROOT } = require("../helpers/load-contract");

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

const HOST_DIR = path.join(PROJECT_ROOT, "native-host");
const INSTALLER_PY = path.join(HOST_DIR, "installer.py");

// Find a Python interpreter. Prefer `python`, fall back to `python3` / `py`.
function findPython() {
  for (const candidate of ["python", "python3", "py"]) {
    try {
      execFileSync(candidate, ["--version"], { encoding: "utf-8", stdio: "pipe" });
      return candidate;
    } catch {
      // try next
    }
  }
  throw new Error("No Python interpreter found (tried python, python3, py)");
}

const PYTHON = findPython();

function runPython(code, env) {
  const fullEnv = { ...process.env, ...env };
  return execFileSync(PYTHON, ["-c", code], {
    cwd: HOST_DIR,
    env: fullEnv,
    encoding: "utf-8",
  });
}

// ── installer.py is importable and has the right surface ─────────────

test("installer.py imports and exposes install_host", () => {
  const output = runPython(
    `import installer; print(hasattr(installer, 'install_host'), hasattr(installer, 'HOST_NAME'), installer.HOST_NAME)`
  );
  const [hasInstall, hasHost, hostName] = output.trim().split(" ");
  assert.strictEqual(hasInstall, "True");
  assert.strictEqual(hasHost, "True");
  assert.strictEqual(hostName, "com.agentao.chrome_extension");
});

test("installer.py builds manifests with host name and allowed_origins", () => {
  const src = fs.readFileSync(INSTALLER_PY, "utf-8");
  assert.ok(src.includes("com.agentao.chrome_extension"), "host name in source");
  assert.ok(src.includes("allowed_origins"), "allowed_origins field");
  assert.ok(src.includes("chrome-extension://"), "origin prefix");
  assert.ok(src.includes("json.dumps"), "uses json.dumps for path escaping");
});

test("installer.py native_messaging_dir returns a path under HOME", () => {
  const output = runPython(
    `import installer; from pathlib import Path; d = installer.native_messaging_dir(); print(str(d)); print(str(Path.home()))`
  );
  const [dirStr, homeStr] = output.trim().split("\n");
  const dir = path.normalize(dirStr);
  const home = path.normalize(homeStr);
  assert.ok(
    dir.startsWith(home),
    `native_messaging_dir (${dir}) should be under HOME (${home})`
  );
  assert.ok(
    dir.includes("NativeMessagingHosts"),
    "path should contain NativeMessagingHosts"
  );
});

test("install_host writes a valid manifest with the extension ID", () => {
  // Use a temp HOME so we don't write to the real NM directory.
  // skip_registry=True prevents clobbering the real Windows registry
  // entry with a temp-directory manifest path (which gets deleted).
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "aic-test-"));
  const fakeHost = path.join(tmpHome, "fake-host");
  fs.writeFileSync(fakeHost, "#!/bin/sh\n", "utf-8");
  const fakeExtId = "abcdefghijklmnopqrstuvwxyzabcdef";

  const code = `
import installer, json
from pathlib import Path
result = installer.install_host(Path(${JSON.stringify(fakeHost)}), ${JSON.stringify(fakeExtId)}, create_launcher=False, skip_registry=True)
print(result.manifest_path)
`;
  const output = runPython(code, { HOME: tmpHome, USERPROFILE: tmpHome });
  const manifestPath = output.trim();
  assert.ok(fs.existsSync(manifestPath), "manifest file should exist");

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  assert.strictEqual(manifest.name, "com.agentao.chrome_extension");
  assert.strictEqual(manifest.type, "stdio");
  assert.strictEqual(
    manifest.allowed_origins[0],
    `chrome-extension://${fakeExtId}/`
  );
  assert.ok(manifest.path.includes("fake-host"), "path should point to host");

  // Cleanup
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

test("install_host rejects empty extension_id", () => {
  const code = `
import installer
try:
    installer.install_host("/tmp/x", "", create_launcher=False)
    print("no-error")
except ValueError:
    print("value-error")
`;
  const output = runPython(code);
  assert.strictEqual(output.trim(), "value-error");
});

console.log("installer.test.js passed");
