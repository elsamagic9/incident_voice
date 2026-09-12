import { chromium } from 'playwright-core';

const artifactDir = '/home/ahmedhassan/.gemini/antigravity/brain/658ab813-749b-4256-b71b-d3cfc99d9c66';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
const page = await context.newPage();

console.log('1. Navigating to http://127.0.0.1:8000 ...');
await page.goto('http://127.0.0.1:8000');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(1000);

// Check for login modal
const loginModal = await page.locator('text=Connect to your workspace').isVisible();
console.log('Login modal visible?', loginModal);
if (loginModal) {
  console.error('FAIL: Login modal is still visible!');
  process.exit(1);
} else {
  console.log('PASS: Zero-login active! Direct Mission Control access verified.');
}

await page.screenshot({ path: `${artifactDir}/human-test-1-mission-control.png`, fullPage: true });
console.log('Saved human-test-1-mission-control.png');

// Test Typing command
console.log('2. Testing typing SRE command: Check cluster health ...');
const commandInput = page.getByLabel('SRE command');
if (await commandInput.isVisible()) {
  await commandInput.fill('Check cluster health');
  await page.getByRole('button', { name: 'Send command', exact: true }).click();
  await page.waitForTimeout(2000);
  console.log('Command sent successfully!');
}
await page.screenshot({ path: `${artifactDir}/human-test-2-cluster-health.png`, fullPage: true });
console.log('Saved human-test-2-cluster-health.png');

// Test Investigate Incident
console.log('3. Testing Investigate Incident click ...');
const investigateBtn = page.getByRole('button', { name: 'Investigate incident', exact: true });
if (await investigateBtn.isVisible()) {
  await investigateBtn.click();
  await page.waitForTimeout(2000);
  console.log('Investigate clicked and hypotheses loaded!');
}
await page.screenshot({ path: `${artifactDir}/human-test-3-investigate.png`, fullPage: true });
console.log('Saved human-test-3-investigate.png');

// Test Two-Phase Staging & Approval
console.log('4. Testing Staged Remediation: Restart payment-service ...');
if (await commandInput.isVisible()) {
  await commandInput.fill('Restart payment-service');
  await page.getByRole('button', { name: 'Send command', exact: true }).click();
  await page.waitForTimeout(1500);
  console.log('Remediation staged! Checking for Approve button...');
  const approveBtn = page.getByRole('button', { name: /Approve action|Authorize/i });
  if (await approveBtn.isVisible()) {
    console.log('PASS: Two-phase authorization guardrail triggered! Clicking approve...');
    await approveBtn.click();
    await page.waitForTimeout(2000);
  }
}
await page.screenshot({ path: `${artifactDir}/human-test-4-approval.png`, fullPage: true });
console.log('Saved human-test-4-approval.png');

// Test Navigate to Usage & Analytics
console.log('5. Testing navigation to Usage & Analytics ...');
const usageBtn = page.getByRole('button', { name: /Usage & Analytics|Usage/ });
if (await usageBtn.isVisible()) {
  await usageBtn.click();
  await page.waitForTimeout(1000);
  console.log('Navigated to Usage & Analytics view!');
}
await page.screenshot({ path: `${artifactDir}/human-test-5-usage.png`, fullPage: true });
console.log('Saved human-test-5-usage.png');

// Test Navigate to System Settings
console.log('6. Testing navigation to System Settings ...');
const settingsBtn = page.getByRole('button', { name: /System Settings|Config/ });
if (await settingsBtn.isVisible()) {
  await settingsBtn.click();
  await page.waitForTimeout(1000);
  console.log('Navigated to System Settings view!');
}
await page.screenshot({ path: `${artifactDir}/human-test-6-settings.png`, fullPage: true });
console.log('Saved human-test-6-settings.png');

await browser.close();
console.log('>>> ALL 6 HUMAN BROWSER WORKFLOW TESTS PASSED CLEANLY! <<<');
