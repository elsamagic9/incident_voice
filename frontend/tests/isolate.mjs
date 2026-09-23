import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const backend = fileURLToPath(new URL('../../backend/', import.meta.url));
const port = 18934;
const runtimeDir = await mkdtemp('/tmp/incident-browser-ov-');
const server = spawn(`${backend}.venv/bin/python`, ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(port)], {
  cwd: backend, stdio: 'ignore', env: { ...process.env, INFRASTRUCTURE_MODE: 'simulation',
    ASSEMBLYAI_API_KEY: '', GEMINI_API_KEY: '', OPENAI_API_KEY: '', OPERATOR_ACCESS_TOKEN: '',
    WAL_STORAGE_DIR: runtimeDir, DEFAULT_ENGINE: 'custom_stt_v3', LLM_PROVIDER: 'mock', TTS_PROVIDER: 'browser', COOKIE_SECURE: 'false' },
});
let browser;
let startupError;
server.on('error', error => { startupError = error; });
const serverClosed = new Promise(resolve => server.once('close', resolve));
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (startupError) throw startupError;
    if (server.exitCode !== null || server.signalCode !== null) throw new Error('Test backend exited before startup');
    try { if ((await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(ready, 'Test backend did not become ready');
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  await context.addInitScript(() => {
    window.speechSynthesis.speak = () => {};
    window.speechSynthesis.cancel = () => {};
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.getByRole('button', { name: 'Inspect payment-service logs' }).waitFor();

  await page.getByLabel('SRE command').fill('Start the Postgres runbook');
  await page.getByRole('button', { name: 'Send command', exact: true }).click();
  await page.getByText('Active SOP Workflow').waitFor();

  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForTimeout(500);

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  console.log(`320px scrollWidth: ${scrollWidth}`);

  if (scrollWidth > 321) {
    const culprit = await page.evaluate(async () => {
      const all = Array.from(document.querySelectorAll('*'));
      for (let i = all.length - 1; i >= 0; i--) {
        const el = all[i];
        if (el === document.documentElement || el === document.body) continue;

        const origDisplay = el.style.display;
        el.style.display = 'none';

        const sw = document.documentElement.scrollWidth;
        if (sw <= window.innerWidth + 1) {
          return el.outerHTML;
        }
        el.style.display = origDisplay;
      }
      return 'Not found';
    });
    console.log(`Culprit element class: ${culprit}`);
  }
  assert(scrollWidth <= 321, `Page overflows at 320px (scrollWidth ${scrollWidth} > 321)`);
  assert.deepEqual(errors, [], 'Browser runtime errors');
  console.log('Mobile isolation passed: backend ready, 320px runbook flow, no horizontal overflow, no browser runtime errors.');
} finally {
  try {
    if (browser) await browser.close();
  } finally {
    const killTimer = setTimeout(() => server.kill('SIGKILL'), 5000);
    try {
      server.kill('SIGTERM');
      await serverClosed;
    } finally {
      clearTimeout(killTimer);
      await rm(runtimeDir, { recursive: true, force: true });
    }
  }
}
