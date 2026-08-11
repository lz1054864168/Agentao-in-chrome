const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const testsRoot = __dirname;

function collectTestFiles(currentDir) {
  if (!fs.existsSync(currentDir)) {
    return [];
  }
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "helpers") {
      continue;
    }
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".test.js")) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

function runTestFile(filePath) {
  const result = childProcess.spawnSync(process.execPath, [filePath], {
    stdio: "inherit",
    cwd: path.join(testsRoot, ".."),
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(
      `${path.relative(testsRoot, filePath)} failed with exit code ${result.status}`
    );
  }
}

function runSuites(suites) {
  const suiteNames =
    Array.isArray(suites) && suites.length > 0 ? suites : ["unit"];
  const files = suiteNames.flatMap((suiteName) =>
    collectTestFiles(path.join(testsRoot, suiteName))
  );
  for (const filePath of files) {
    runTestFile(filePath);
  }
  return { suites: suiteNames, fileCount: files.length };
}

function main() {
  const suites = process.argv.slice(2);
  const result = runSuites(suites);
  console.log(
    `suite ${result.suites.join(", ")} passed (${result.fileCount} files)`
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
}

module.exports = { collectTestFiles, runTestFile, runSuites };
