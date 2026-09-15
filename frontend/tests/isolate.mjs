import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
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

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error('Test backend exited before startup');
    try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) { ready = true; break; } } catch { /* Startup pending. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}`);
  await page.getByRole('button', { name: 'Inspect payment-service logs' }).waitFor();
  
  await page.getByLabel('SRE command').fill('Start the Postgres runbook');
  await page.getByRole('button', { name: 'Send command', exact: true }).click();
  await page.getByText('Active SOP Workflow').waitFor();

  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForTimeout(500);

  const initialScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  console.log(`Initial scrollWidth: ${initialScrollWidth}`);

  if (initialScrollWidth > 321) {
    const culpit = await page.evaluate(async () => {
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
       return "Not found";
    });
    console.log(`Culprit element class: ${culpit}`);
  }

  await browser.close();
} finally {
  server.kill('SIGTERM');
  await rm(runtimeDir, { recursive: true, force: true });
}
