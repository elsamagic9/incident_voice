// Local Chrome + the real backend in isolated simulation mode. Run after npm run build.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const backend = fileURLToPath(new URL('../../backend/', import.meta.url));
const port = 18932;
const runtimeDir = await mkdtemp('/tmp/incident-browser-');
const server = spawn(`${backend}.venv/bin/python`, ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(port)], {
  cwd: backend, stdio: 'ignore', env: { ...process.env, INFRASTRUCTURE_MODE: 'simulation',
    ASSEMBLYAI_API_KEY: '', GEMINI_API_KEY: '', OPENAI_API_KEY: '', OPERATOR_ACCESS_TOKEN: '',
    WAL_STORAGE_DIR: runtimeDir, DEFAULT_ENGINE: 'custom_stt_v3', LLM_PROVIDER: 'mock', TTS_PROVIDER: 'browser', COOKIE_SECURE: 'false' },
});
let browser;
try {
  await mkdir('/tmp/opencode', { recursive: true });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error('Test backend exited before startup');
    try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) { ready = true; break; } } catch { /* Startup pending. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(ready, 'Test backend did not become ready');
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    // Voice playback is out of scope for layout/interaction checks.
    window.speechSynthesis.speak = () => {};
    window.speechSynthesis.cancel = () => {};
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.getByRole('button', { name: 'Inspect payment-service logs' }).waitFor();
  assert(await page.getByRole('heading', { name: /Less typing/ }).isVisible());
  await page.screenshot({ path: '/tmp/opencode/incident-voice-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 1366, height: 768 });
  assert(await page.getByLabel('SRE command').evaluate(element => element.getBoundingClientRect().bottom <= innerHeight), 'Composer must be visible on a laptop without page scrolling');
  await page.setViewportSize({ width: 1440, height: 1050 });

  await page.getByRole('button', { name: 'Investigate incident', exact: true }).click();
  await page.getByRole('heading', { name: 'What the evidence suggests' }).waitFor();
  await page.getByRole('button', { name: 'View evidence E01' }).first().click();
  assert(await page.evaluate(() => document.activeElement?.id === 'evidence-E01'));
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export handoff' }).click();
  const handoff = await downloadEvent;
  assert(handoff.suggestedFilename() === 'incident-handoff.json');
  await page.getByLabel('SRE command').fill('Check cluster health');
  await page.getByRole('button', { name: 'Send command', exact: true }).click();
  await page.locator('.tool-card').first().waitFor();
  await page.getByLabel('SRE command').fill('Restart payment-service');
  await page.getByRole('button', { name: 'Send command', exact: true }).click();
  await page.getByRole('button', { name: 'Approve action' }).click();
  await page.getByRole('button', { name: 'Approve action' }).waitFor({ state: 'detached' });
  await page.getByRole('heading', { name: 'The target is healthy.' }).waitFor();
  await page.getByRole('button', { name: 'Check the whole cluster' }).click();
  await page.getByRole('heading', { name: 'Recovery is still in progress' }).waitFor();
  await page.getByRole('heading', { name: /Less typing/ }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/opencode/incident-voice-brief.png', fullPage: true });

  await page.getByRole('button', { name: 'Create incident report' }).click();
  await page.getByRole('dialog', { name: 'Incident review' }).waitFor();
  await page.getByText(/Source: Local event summary/).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Open incident report' }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: 'Close incident review' }).click();

  // Test Top-Level Navigation to Usage & Analytics
  await page.getByRole('button', { name: 'Usage & Analytics' }).click();
  await page.getByRole('heading', { name: 'Usage Graph & Acoustic Telemetry' }).waitFor();
  assert(await page.getByText('Total Tokens').isVisible());
  assert(await page.getByText('Four-Stage Acoustic Latency Waterfall').isVisible());
  await page.screenshot({ path: '/tmp/opencode/incident-voice-usage.png', fullPage: true });

  // Test Top-Level Navigation to System Settings
  await page.getByRole('button', { name: 'System Settings' }).click();
  await page.getByRole('heading', { name: 'Settings & Preferences' }).waitFor();
  assert(await page.getByText('AssemblyAI Orchestration Mode').isVisible());
  await page.screenshot({ path: '/tmp/opencode/incident-voice-settings.png', fullPage: true });

  // Navigate back to Mission Control
  await page.getByLabel('Back to Mission Control').click();
  await page.getByRole('heading', { name: /Less typing/ }).waitFor();

  // Activate a runbook so its banner (status tag + Abort action) is part of the responsive check.
  await page.getByLabel('SRE command').fill('Start the Postgres runbook');
  await page.getByRole('button', { name: 'Send command', exact: true }).click();
  await page.getByText('Active SOP Workflow').waitFor();

  for (const viewport of [{ width: 320, height: 568 }, { width: 375, height: 812 }, { width: 812, height: 375 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(viewport);
    if (viewport.width === 375) await page.screenshot({ path: '/tmp/opencode/incident-voice-mobile.png', fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `Page overflows at ${viewport.width}px`);
    await page.getByRole('button', { name: 'Demo lab', exact: true }).click();
    await page.getByRole('button', { name: /Ingress Traffic Surge/ }).click();
    await page.getByRole('button', { name: 'Services', exact: true }).click();
    if (viewport.width === 375) {
      await page.getByRole('heading', { name: /Less typing/ }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: '/tmp/opencode/incident-voice-mobile.png', fullPage: true });
    }
  }
  assert.deepEqual(errors, [], 'Browser runtime errors');
  console.log('Browser smoke passed: real session, cited brief, handoff export, commands, approval, recovery checks, report reopen/Escape, demo scenarios, settings, and responsive overflow checks.');
  console.log('Screenshots: /tmp/opencode/incident-voice-desktop.png and /tmp/opencode/incident-voice-mobile.png');
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
  await new Promise(resolve => { if (server.exitCode !== null) resolve(); else server.once('exit', resolve); });
  await rm(runtimeDir, { recursive: true, force: true });
}
