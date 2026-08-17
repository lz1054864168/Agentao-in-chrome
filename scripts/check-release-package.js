// Check that the release package contains all required files and that
// no forbidden files (secrets, .env, build artifacts) are included.
// Run with: node scripts/check-release-package.js

const fs = require("node:fs");
const path = require("node:path");

const PROJECT_ROOT = path.join(__dirname, "..");
const EXTENSION_ROOT = path.join(PROJECT_ROOT, "extension");

const REQUIRED_FILES = [
  "extension/manifest.json",
  "extension/agentao-contract.js",
  "extension/theme-init.js",
  "extension/i18n-runtime.js",
  "extension/native-host-binding.js",
  "extension/service-worker-loader.js",
  "extension/service-worker-runtime.js",
  "extension/sidepanel.html",
  "extension/sidepanel.js",
  "extension/sidepanel.css",
  "extension/options.html",
  "extension/options.js",
  "extension/options.css",
  "extension/icon-128.png",
  "package.json",
  "README.md",
  "native-host/native_host.py",
  "native-host/agentao_transport.py",
  "native-host/host_protocol.py",
  "native-host/installer.py",
  "scripts/build_native_host.py",
  "scripts/install_native_host.py",
  ".github/workflows/release.yml",
];

const REQUIRED_DIRS = [
  "extension/_locales/en",
  "extension",
  "native-host",
  "docs",
  "tests",
  "scripts",
  ".github/workflows",
];

const FORBIDDEN_FILES = [
  ".env",
  "agentao.log",
  "node_modules",
  ".venv",
  "__pycache__",
  ".agentao",
  "dist",
  "build",
  "Releases",
];

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`✓ ${msg}`);
}

function exists(relativePath) {
  return fs.existsSync(path.join(PROJECT_ROOT, relativePath));
}

function main() {
  console.log("Checking release package...\n");

  let allOk = true;

  for (const file of REQUIRED_FILES) {
    if (exists(file)) {
      ok(`required file: ${file}`);
    } else {
      fail(`missing required file: ${file}`);
      allOk = false;
    }
  }

  for (const dir of REQUIRED_DIRS) {
    if (exists(dir)) {
      ok(`required dir: ${dir}`);
    } else {
      fail(`missing required dir: ${dir}`);
      allOk = false;
    }
  }

  for (const file of FORBIDDEN_FILES) {
    if (exists(file)) {
      fail(`forbidden file present: ${file}`);
      allOk = false;
    } else {
      ok(`forbidden file absent: ${file}`);
    }
  }

  // Validate manifest.json is valid JSON
  try {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(EXTENSION_ROOT, "manifest.json"), "utf-8")
    );
    if (manifest.manifest_version === 3) {
      ok("manifest.json is valid MV3");
    } else {
      fail("manifest.json is not MV3");
      allOk = false;
    }
  } catch (err) {
    fail(`manifest.json is invalid JSON: ${err.message}`);
    allOk = false;
  }

  console.log("");
  if (allOk) {
    console.log("✓ Release package check passed.");
  } else {
    console.error("✗ Release package check FAILED.");
  }
}

main();
