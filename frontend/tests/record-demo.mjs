// Records the submission demo video against a running IncidentVoice build.
//
//   Local (starts its own backend, real AssemblyAI key from backend/.env):
//     node tests/record-demo.mjs
//   Deployed URL (records what judges will actually see):
//     DEMO_URL=https://incident-voice.onrender.com node tests/record-demo.mjs
//
// Produces docs/demo/incident-voice-demo.webm plus one PNG per beat.
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../../', import.meta.url));
const backend = fileURLToPath(new URL('../../backend/', import.meta.url));
const outDir = fileURLToPath(new URL('../../docs/demo/', import.meta.url));
const remote = process.env.DEMO_URL;
const port = 18941;
const base = remote || `http://127.0.0.1:${port}`;

let server;
if (!remote) {
  const env = { ...process.env, INFRASTRUCTURE_MODE: 'simulation', OPERATOR_ACCESS_TOKEN: '',
    WAL_STORAGE_DIR: await mkdtemp('/tmp/incident-demo-'), COOKIE_SECURE: 'false' };
  // Reuse the developer's real keys so the on-screen brief comes from AssemblyAI.
  try { Object.assign(env, parseDotEnv(await readFile(`${backend}.env`, 'utf8'))); } catch { /* Simulation only. */ }
  env.INFRASTRUCTURE_MODE = 'simulation';
  env.OPERATOR_ACCESS_TOKEN = '';
  env.COOKIE_SECURE = 'false';
  // The brief must visibly come from AssemblyAI, so force the LLM Gateway over
  // whatever provider the developer's .env happens to default to.
  env.LLM_PROVIDER = 'assemblyai';
  server = spawn(`${backend}.venv/bin/python`, ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(port)],
    { cwd: backend, stdio: 'ignore', env });
}

function parseDotEnv(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const wait = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true });
try {
  await mkdir(outDir, { recursive: true });
  if (server) {
    for (let i = 0; i < 200; i++) {
      if (server.exitCode !== null) throw new Error('Backend exited during startup');
      try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ }
      await wait(150);
    }
  }

  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    recordVideo: { dir: `${outDir}video`, size: { width: 1600, height: 900 } },
  });
  await context.addInitScript(() => {
    window.speechSynthesis.speak = () => {};
    window.speechSynthesis.cancel = () => {};
  });
  const page = await context.newPage();
  const shot = async name => { await page.screenshot({ path: `${outDir}${name}.png` }); console.log(`  shot ${name}`); };
  const say = async text => {
    const box = page.getByLabel('SRE command');
    await box.fill(text);
    await page.getByRole('button', { name: 'Send command', exact: true }).click();
  };

  console.log(`Recording ${base}`);
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Investigate incident', exact: true }).waitFor({ timeout: 90_000 });
  await wait(2500);
  await shot('01-landing');

  // 1. Investigate -> evidence-grounded brief
  await page.getByRole('button', { name: 'Investigate incident', exact: true }).click();
  await page.getByRole('heading', { name: 'What the evidence suggests' }).waitFor({ timeout: 60_000 });
  await wait(4000);
  await shot('02-investigation-brief');

  // 2. Open a cited observation
  await page.getByRole('button', { name: 'View evidence E01' }).first().click();
  await wait(3000);
  await shot('03-cited-evidence');

  // 3. Stage a destructive change -> approval card with the spoken code
  await say('Restart payment-service');
  await page.getByRole('button', { name: 'Approve action' }).waitFor({ timeout: 30_000 });
  await wait(2000);
  await shot('04-staged-approval-card');

  // Each staged action gets its own code, so read it from the card that is on
  // screen right now rather than reusing an earlier one.
  const readCode = async () => {
    const raw = await page.locator('.challenge-code code').first().innerText();
    return raw.replace(/[\u201c\u201d"' ]/g, '').replace(/^Confirm/i, '').trim();
  };
  console.log(`  code on first staging: ${await readCode()}`);

  // 4. Veto: a second staged action is cancelled, not executed
  await page.getByRole('button', { name: 'Cancel' }).click();
  await wait(2000);
  await shot('05-cancelled');

  // 5. Restage, then authorize by speaking the code (a bare "confirm" no longer works)
  await say('Restart payment-service');
  await page.getByRole('button', { name: 'Approve action' }).waitFor({ timeout: 30_000 });
  await wait(1500);
  const code = await readCode();
  console.log(`  code on second staging: ${code}`);
  await say(`Confirm ${code}`);
  await page.getByRole('button', { name: 'Approve action' }).waitFor({ state: 'detached', timeout: 30_000 });
  // The recovery panel is only rendered once the target reports healthy.
  await page.getByRole('heading', { name: 'The target is healthy.' }).waitFor({ timeout: 30_000 });
  await wait(3000);
  await shot('06-approved-and-applied');

  // 6. A restart is not a recovery
  await page.getByRole('button', { name: 'Check the whole cluster' }).click();
  await page.getByRole('heading', { name: 'Recovery is still in progress' }).waitFor({ timeout: 30_000 });
  await wait(4000);
  await shot('07-recovery-partial');

  // 7. Evidence handoff + incident review
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export handoff' }).click();
  await dl;
  await wait(1500);
  await page.getByRole('button', { name: 'Create incident report' }).click();
  await page.getByRole('dialog', { name: 'Incident review' }).waitFor({ timeout: 45_000 });
  await wait(5000);
  await shot('08-incident-review');
  await page.keyboard.press('Escape');

  const video = page.video();
  await context.close();
  console.log(`Video: ${await video.path()}`);
} finally {
  await browser.close();
  if (server) server.kill('SIGTERM');
}
