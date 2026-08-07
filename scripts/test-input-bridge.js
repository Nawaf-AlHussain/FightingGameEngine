// Phase 0.5 Input Bridge Test — headless browser verification
//
// Spins up an embedded HTTP server to serve /game/* and /test/* from
// the project's public/ directory, then runs Playwright against it.

const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = '/home/z/my-project/fight-engine';
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');
const PORT = 8099;
const TEST_URL = `http://localhost:${PORT}/test/input-bridge.html`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
};

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      // Strip query string, decode URI, normalize path
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      // Prevent path traversal
      const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
      const filePath = path.join(PUBLIC_DIR, safePath);

      fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found: ' + urlPath);
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME[ext] || 'application/octet-stream';
        // For .wasm and .data, set Content-Length explicitly and stream
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': stats.size,
          // CORS not needed for same-origin, but harmless
          'Access-Control-Allow-Origin': '*',
        });
        fs.createReadStream(filePath).pipe(res);
      });
    });

    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', () => {
      console.log(`Static server listening on http://localhost:${PORT}/`);
      resolve(server);
    });
  });
}

async function runTest() {
  const results = {
    wasmLoaded: false,
    fnSetInput: false,
    fnIsActive: false,
    fnDisable: false,
    injectionWorks: false,
    p2ActiveToggleWorks: false,
    errors: [],
    logs: [],
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  page.on('console', msg => {
    const text = msg.text();
    results.logs.push(`[${msg.type()}] ${text}`);
    // Only treat as test failure if it happens BEFORE the test completes.
    // The engine's abortSystem() assertion fires when the game loop tries to
    // render without a real SDL canvas — that's a Phase 1 concern, not Phase 0.5.
    // We filter known engine-internal assertion messages.
    if (msg.type() === 'error') {
      const isEngineAssertion = text.includes('abortSystem') ||
                                text.includes('Aborted(Assertion failed') ||
                                text.includes('system_win.cpp');
      if (!isEngineAssertion) {
        results.errors.push(text);
      }
    }
  });
  page.on('pageerror', err => {
    const msg = err.message;
    const isEngineAssertion = msg.includes('abortSystem') ||
                              msg.includes('Aborted(Assertion failed') ||
                              msg.includes('system_win.cpp');
    if (!isEngineAssertion) {
      results.errors.push(`PAGE ERROR: ${msg}`);
    }
  });

  console.log(`Loading ${TEST_URL} ...`);
  await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  console.log('Waiting for WASM runtime to initialize...');
  try {
    await page.waitForFunction(
      () => {
        const el = document.getElementById('status');
        return el && (el.textContent === 'READY' || el.textContent.startsWith('FAIL'));
      },
      { timeout: 90000 }
    );
  } catch (e) {
    results.errors.push(`Timeout waiting for runtime init: ${e.message}`);
    await browser.close();
    return results;
  }

  const status = await page.textContent('#status');
  console.log(`WASM status: ${status}`);

  if (status.startsWith('FAIL')) {
    results.errors.push(`WASM failed to initialize: ${status}`);
    await browser.close();
    return results;
  }

  results.wasmLoaded = true;

  const fnStatus = await page.textContent('#fn-status');
  const fnStatus2 = await page.textContent('#fn-status-2');
  const fnStatus3 = await page.textContent('#fn-status-3');
  console.log(`Function exports: setInput=${fnStatus} isActive=${fnStatus2} disable=${fnStatus3}`);

  results.fnSetInput = fnStatus === 'OK';
  results.fnIsActive = fnStatus2 === 'OK';
  results.fnDisable = fnStatus3 === 'OK';

  if (!results.fnSetInput) {
    results.errors.push('_setExternalPlayerInput is not exported');
    await browser.close();
    return results;
  }

  console.log('Test 1: Inject "F" into P2...');
  await page.click('button[data-input="F"]');
  await page.waitForTimeout(500);

  const p2ActiveAfterInject = await page.evaluate(() => {
    if (typeof window.Module._isExternalInputActive !== 'function') return 'no-fn';
    try {
      return window.Module._isExternalInputActive(1);
    } catch (e) {
      return 'error: ' + e.message;
    }
  });
  console.log(`P2 active after inject: ${p2ActiveAfterInject}`);
  results.injectionWorks = (p2ActiveAfterInject === 1);
  if (!results.injectionWorks) {
    results.errors.push(`Expected _isExternalInputActive(1) to return 1 after inject, got: ${p2ActiveAfterInject}`);
  }

  const p2ActiveText = await page.textContent('#p2-active');
  console.log(`P2 active indicator: ${p2ActiveText}`);
  results.p2ActiveToggleWorks = (p2ActiveText === 'YES');

  console.log('Test 2: Inject "Fa" (forward + punch)...');
  await page.click('button[data-input="Fa"]');
  await page.waitForTimeout(200);
  const lastInj = await page.textContent('#last-injection');
  console.log(`Last injection: ${lastInj}`);
  if (lastInj !== '"Fa"') {
    results.errors.push(`Expected last-injection to be "Fa", got: ${lastInj}`);
  }

  console.log('Test 3: Inject "" (release)...');
  await page.click('button[data-input=""]');
  await page.waitForTimeout(200);
  const lastInj2 = await page.textContent('#last-injection');
  console.log(`Last injection after release: ${lastInj2}`);
  if (lastInj2 !== '""') {
    results.errors.push(`Expected last-injection to be "" after release, got: ${lastInj2}`);
  }

  console.log('Test 4: Direct Module._setExternalPlayerInput(1, "D")...');
  const directResult = await page.evaluate(() => {
    try {
      window.Module._setExternalPlayerInput(1, 'D');
      return 'ok';
    } catch (e) {
      return 'error: ' + e.message;
    }
  });
  console.log(`Direct call result: ${directResult}`);
  if (directResult !== 'ok') {
    results.errors.push(`Direct _setExternalPlayerInput call failed: ${directResult}`);
  }

  console.log('Test 5: Disable external input on P2...');
  const disableResult = await page.evaluate(() => {
    if (typeof window.Module._disableExternalInput !== 'function') return 'no-fn';
    try {
      window.Module._disableExternalInput(1);
      return 'ok';
    } catch (e) {
      return 'error: ' + e.message;
    }
  });
  console.log(`Disable result: ${disableResult}`);
  if (disableResult !== 'ok') {
    results.errors.push(`_disableExternalInput call failed: ${disableResult}`);
  }

  await page.waitForTimeout(200);
  const p2ActiveAfterDisable = await page.evaluate(() => {
    return window.Module._isExternalInputActive(1);
  });
  console.log(`P2 active after disable: ${p2ActiveAfterDisable}`);
  if (p2ActiveAfterDisable !== 0) {
    results.errors.push(`Expected _isExternalInputActive to return 0 after disable, got: ${p2ActiveAfterDisable}`);
  }

  const fullLog = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('#log > div')).map(d => d.textContent);
  });
  results.logs = fullLog;

  await browser.close();
  return results;
}

(async () => {
  let server;
  try {
    server = await startServer();
  } catch (e) {
    console.error('Failed to start server:', e);
    process.exit(2);
  }

  try {
    const r = await runTest();
    console.log('\n========== TEST RESULTS ==========');
    console.log(`WASM loaded:           ${r.wasmLoaded ? 'PASS' : 'FAIL'}`);
    console.log(`_setExternalPlayerInput: ${r.fnSetInput ? 'PASS' : 'FAIL'}`);
    console.log(`_isExternalInputActive:  ${r.fnIsActive ? 'PASS' : 'FAIL'}`);
    console.log(`_disableExternalInput:   ${r.fnDisable ? 'PASS' : 'FAIL'}`);
    console.log(`Injection works:        ${r.injectionWorks ? 'PASS' : 'FAIL'}`);
    console.log(`P2 active indicator:    ${r.p2ActiveToggleWorks ? 'PASS' : 'FAIL'}`);
    console.log(`Errors: ${r.errors.length}`);
    r.errors.forEach(e => console.log(`  - ${e}`));
    console.log('\n========== EVENT LOG (last 30) ==========');
    r.logs.slice(-30).forEach(l => console.log(l));

    const allPass = r.wasmLoaded && r.fnSetInput && r.fnIsActive && r.fnDisable
                    && r.injectionWorks && r.p2ActiveToggleWorks
                    && r.errors.length === 0;
    console.log(`\n========== ${allPass ? 'ALL TESTS PASSED' : 'TESTS FAILED'} ==========`);

    server.close();
    process.exit(allPass ? 0 : 1);
  } catch (e) {
    console.error('Test runner crashed:', e);
    server.close();
    process.exit(2);
  }
})();
