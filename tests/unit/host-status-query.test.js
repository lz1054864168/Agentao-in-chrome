// Verify the GET_HOST_STATUS query flow:


// - sidepanel.js and options.js send GET_HOST_STATUS on load


// - service-worker-runtime.js responds with the current connection status


//


// This guards against the bug where the sidepanel showed "Disconnected"


// even after the native host was already connected, because the status


// change event fired before the sidepanel was open.





const assert = require("node:assert");


const fs = require("node:fs");


const path = require("node:path");


const vm = require("node:vm");


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





// ── Static: sidepanel.js and options.js query GET_HOST_STATUS on load ──





test("sidepanel.js sends GET_HOST_STATUS on load", () => {


  const src = readSource("sidepanel.js");


  assert.ok(


    src.includes("MSG.GET_HOST_STATUS"),


    "sidepanel.js must send GET_HOST_STATUS to query the host status on load"


  );


});





test("options.js sends GET_HOST_STATUS on load", () => {


  const src = readSource("options.js");


  assert.ok(


    src.includes("MSG.GET_HOST_STATUS"),


    "options.js must send GET_HOST_STATUS to query the host status on load"


  );


});





// ── Dynamic: service worker responds with connection status ───────────





function loadRuntimeSandbox() {


  const sandbox = { globalThis: {}, console, setTimeout, clearTimeout };


  sandbox.globalThis = sandbox;


  vm.createContext(sandbox);





  // Load contract into the sandbox


  const contractSrc = fs.readFileSync(


    path.join(PROJECT_ROOT, "agentao-contract.js"),


    "utf-8"


  );


  vm.runInContext(contractSrc, sandbox);





  // Load service-worker-runtime.js into the sandbox


  const runtimeSrc = fs.readFileSync(


    path.join(PROJECT_ROOT, "service-worker-runtime.js"),


    "utf-8"


  );


  vm.runInContext(runtimeSrc, sandbox);





  return sandbox;


}





function createMockChrome() {


  const listeners = {


    runtimeOnMessage: [],


    actionOnClicked: [],


    commandsOnCommand: [],


  };


  const port = {


    onMessage: { addListener: () => {} },


    onDisconnect: { addListener: () => {} },


    postMessage: () => {},


    disconnect: () => {},


  };


  return {


    runtime: {


      connectNative: () => port,


      lastError: null,


      onMessage: {


        addListener: (fn) => listeners.runtimeOnMessage.push(fn),


      },


      sendMessage: () => Promise.resolve(),


      onConnect: { addListener: () => {} },


    },


    action: {


      onClicked: { addListener: (fn) => listeners.actionOnClicked.push(fn) },


    },


    commands: {


      onCommand: {


        addListener: (fn) => listeners.commandsOnCommand.push(fn),


      },


    },


    sidePanel: { open: () => Promise.resolve() },


    tabs: { get: () => Promise.resolve({}), group: () => Promise.resolve(0) },


    tabGroups: { update: () => Promise.resolve() },


    storage: {


      local: {


        get: () =>


          Promise.resolve({


            [contract.provider.PROFILES_STORAGE_KEY]: [],


          }),


      },


    },


    _listeners: listeners,


  };


}





test("service worker responds to GET_HOST_STATUS with connection status", () => {


  const sandbox = loadRuntimeSandbox();


  const mockChrome = createMockChrome();





  const factory = sandbox.globalThis.__AIC_SERVICE_WORKER_RUNTIME__


    .createServiceWorkerRuntime;


  assert.ok(factory, "createServiceWorkerRuntime must be exported");





  const runtime = factory({ chrome: mockChrome, console });





  // The runtime connects on construction; connectNative succeeds in the mock.
  // With LLM_STATUS gating, status stays "connecting" until the host reports
  // LLM_STATUS "ok". The mock host never sends that, so status is "connecting".


  let capturedResponse = null;


  const sendResponse = (resp) => {


    capturedResponse = resp;


  };





  const onMessageListener = mockChrome._listeners.runtimeOnMessage[0];


  assert.ok(onMessageListener, "runtime.onMessage listener must be registered");





  onMessageListener(

    { type: contract.messages.GET_HOST_STATUS },

    {},

    sendResponse

  );



  assert.ok(capturedResponse, "sendResponse must be called");

  assert.strictEqual(capturedResponse.success, true);

  assert.strictEqual(
    capturedResponse.status,
    "connecting",
    "GET_HOST_STATUS must return the current connection status (connecting until LLM_STATUS ok)"
  );



  // Clean up: disconnect clears the reconnect timer so the process can exit.

  runtime._connection.disconnect();

});





test("GET_HOST_STATUS response reflects disconnected state", () => {


  const sandbox = loadRuntimeSandbox();





  // Mock chrome where connectNative throws -> status stays disconnected


  const mockChrome = createMockChrome();


  mockChrome.runtime.connectNative = () => {


    throw new Error("native host not installed");


  };





  const factory = sandbox.globalThis.__AIC_SERVICE_WORKER_RUNTIME__


    .createServiceWorkerRuntime;


  const runtime = factory({ chrome: mockChrome, console });





  let capturedResponse = null;


  const sendResponse = (resp) => {


    capturedResponse = resp;


  };





  const onMessageListener = mockChrome._listeners.runtimeOnMessage[0];


  onMessageListener(


    { type: contract.messages.GET_HOST_STATUS },


    {},


    sendResponse


  );



  assert.ok(capturedResponse, "sendResponse must be called");

  assert.strictEqual(capturedResponse.success, true);

  assert.strictEqual(

    capturedResponse.status,

    "disconnected",

    "status must be disconnected when connectNative fails"

  );



  // Clean up: disconnect clears the reconnect timer so the process can exit.

  runtime._connection.disconnect();

});



console.log("host-status-query.test.js passed");

process.exit(0);

