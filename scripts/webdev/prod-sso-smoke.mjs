import { chromium } from 'playwright';

const prodPagesUrl = 'https://timewhere-web.pages.dev';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log('WebDev prod Google SSO smoke');
  console.log('============================');

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const browserWarnings = [];
    page.on('console', message => { if (message.type() === 'warning') browserWarnings.push(message.text()); });
    await page.goto(`${prodPagesUrl}/legacy-v032/pages/settings/settings.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.locator('html[data-timewhere-web-ready="true"][data-timewhere-auth-gate="true"]').waitFor({ state: 'attached', timeout: 30000 });
    await page.locator('.timewhere-auth-gate').waitFor({ state: 'visible', timeout: 15000 });
    await page.getByText('先登录，再进入你的时间工作台').waitFor({ state: 'visible', timeout: 15000 });

    const settingsVisible = await page.locator('.main-wrapper .settings-container').isVisible({ timeout: 1000 }).catch(() => false);
    assert(!settingsVisible, 'Unauthenticated prod user entered Settings instead of the login gate.');

    const notConfiguredVisible = await page.getByText('Google SSO 尚未配置').isVisible({ timeout: 3000 }).catch(() => false);
    assert(!notConfiguredVisible, 'Prod Pages reports Google SSO is not configured.');

    await page.waitForFunction(() => Boolean(window.google?.accounts?.id), null, { timeout: 30000 });
    console.log('  PASS Google Identity Services script loaded on prod origin');

    const mount = page.locator('#timewhereAuthGoogle').first();
    await mount.waitFor({ state: 'attached', timeout: 30000 });
    const buttonFrame = mount.locator('iframe').first();
    await buttonFrame.waitFor({ state: 'attached', timeout: 30000 });
    const frameSrc = await buttonFrame.getAttribute('src');
    assert(String(frameSrc || '').includes('accounts.google.com'), 'Google SSO button iframe did not come from accounts.google.com.');
    await page.waitForTimeout(1500);
    const repeatedInitializeWarnings = browserWarnings.filter(message => message.includes('initialize() is called multiple times'));
    assert(repeatedInitializeWarnings.length === 0, `Google SSO initialized repeatedly (${repeatedInitializeWarnings.length} warnings).`);
    console.log('  PASS Google SSO button rendered on the first-run auth gate');
    console.log('  PASS Google SSO initialized once without a render loop');

    await page.locator('#timewhereAuthDemo').waitFor({ state: 'visible', timeout: 5000 });
    console.log('  PASS Auth gate keeps demo entry explicit and separate from real Cloud session');

    console.log('============================');
    console.log('Prod Google SSO smoke passed without using a real Google session, token, account email, or OAuth secret.');
  } finally {
    if (browser) await browser.close();
  }
}

main().catch(error => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});