// Load agentao-contract.js in a Node.js environment (no browser globals).
// The contract uses globalThis, which exists in Node, so we just eval
// the file in a sandbox that provides globalThis.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const PROJECT_ROOT = path.join(__dirname, "..", "..");

function loadContract() {
  const contractPath = path.join(PROJECT_ROOT, "agentao-contract.js");
  const source = fs.readFileSync(contractPath, "utf-8");
  const sandbox = { globalThis: {}, console };
  // agentao-contract.js writes to globalThis.__AIC_CONTRACT__
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox.globalThis.__AIC_CONTRACT__;
}

function readJson(relativePath) {
  const fullPath = path.join(PROJECT_ROOT, relativePath);
  return JSON.parse(fs.readFileSync(fullPath, "utf-8"));
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(PROJECT_ROOT, relativePath));
}

module.exports = { loadContract, readJson, fileExists, PROJECT_ROOT };
