// Test: load fight screen, wait, inject inputs, screenshot
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  const filePath = path.join('/home/z/my-project/fight-engine/public', req.url.split('?')[0]);
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) { res.writeHead(404); res.end(); return; }
    const ext = path.extname(filePath).toLowerCase();
    const MIME = {'.html':'text/html','.js':'application/javascript','.wasm':'application/wasm','.data':'application/octet-stream'};
    res.writeHead(200, {'Content-Type': MIME[ext]||'application/octet-stream', 'Content-Length': stats.size});
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(8099, async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('[PAGEERR] ' + e.message.substring(0, 300)));

  await page.goto('http://localhost:8099/test/input-bridge.html', { waitUntil: 'domcontentloaded' }).catch(e => {});

  // Wait for READY
  try {
    await page.waitForFunction(() => {
      const s = document.getElementById('status');
      return s && (s.textContent === 'READY' || s.textContent.startsWith('FAIL'));
    }, { timeout: 15000 });
  } catch(e) { console.log('Status timeout'); }

  console.log('=== Engine ready, waiting 3s for fight screen to load ===');
  await page.waitForTimeout(3000);

  // Screenshot before input
  await page.screenshot({ path: '/tmp/fight-before-input.png' });
  console.log('Screenshot 1 saved (before input)');

  // Check P2 active status
  const p2Before = await page.evaluate(() => {
    try { return window.Module._isExternalInputActive(1); } catch(e) { return 'err:'+e.message; }
  });
  console.log('P2 active before inject:', p2Before);

  // Inject inputs for P1 (controller 0) — forward + punch
  const injectResult = await page.evaluate(() => {
    try {
      // Inject "F" (forward) into P1 (controller 0)
      window.Module._setExternalPlayerInput(0, 'F');
      return 'P1 F injected';
    } catch(e) { return 'err: '+e.message; }
  });
  console.log('Inject result:', injectResult);

  // Wait 2 seconds with forward held
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/fight-after-F.png' });
  console.log('Screenshot 2 saved (after F)');

  // Inject punch
  await page.evaluate(() => {
    try { window.Module._setExternalPlayerInput(0, 'Fa'); } catch(e) {}
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/fight-after-Fa.png' });
  console.log('Screenshot 3 saved (after Fa)');

  // Release
  await page.evaluate(() => {
    try { window.Module._setExternalPlayerInput(0, ''); } catch(e) {}
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/fight-after-release.png' });
  console.log('Screenshot 4 saved (after release)');

  // Get log
  const log = await page.evaluate(() => document.getElementById('log')?.textContent || 'no log').catch(e => 'CRASHED');
  const fightMsgs = log.match(/\[FIGHT\][^\[]*/g) || [];
  console.log('\n=== FIGHT messages (' + fightMsgs.length + ') ===');
  fightMsgs.slice(-5).forEach(m => console.log(m.trim()));

  // Check for errors
  const wrapperMsgs = log.match(/\[WRAPPER\][^\[]*/g) || [];
  console.log('\n=== WRAPPER messages (last 5) ===');
  wrapperMsgs.slice(-5).forEach(m => console.log(m.trim()));

  // Check for any Aborted
  if (log.includes('Aborted')) {
    const abortIdx = log.lastIndexOf('Aborted');
    console.log('\n=== Aborted context ===');
    console.log(log.substring(Math.max(0, abortIdx - 100), abortIdx + 100));
  } else {
    console.log('\nNo Aborted messages found!');
  }

  console.log('\n=== Last 300 chars ===');
  console.log(log.substring(Math.max(0, log.length - 300)));

  await browser.close().catch(() => {});
  server.close();
  process.exit(0);
});
