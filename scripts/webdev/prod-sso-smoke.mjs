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
    await page.goto(prodPagesUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.locator('.sidebar .nav-item[title="设置"]').click();
    await page.locator('.legacy-page-settings .main-wrapper .settings-container').waitFor({ state: 'visible', timeout: 15000 });

    const notConfiguredVisible = await page.getByText('Set VITE_GOOGLE_OIDC_CLIENT_ID to enable Google SSO.').isVisible({ timeout: 3000 }).catch(() => false);
    assert(!notConfiguredVisible, 'Prod Pages reports Google SSO is not configured.');

    await page.waitForFunction(() => Boolean(window.google?.accounts?.id), null, { timeout: 30000 });
    console.log('  PASS Google Identity Services script loaded on prod origin');

    const mount = page.locator('#googleSsoButtonMount.google-sso-button-mount').first();
    await mount.waitFor({ state: 'attached', timeout: 30000 });
    const buttonFrame = mount.locator('iframe').first();
    await buttonFrame.waitFor({ state: 'attached', timeout: 30000 });
    const frameSrc = await buttonFrame.getAttribute('src');
    assert(String(frameSrc || '').includes('accounts.google.com'), 'Google SSO button iframe did not come from accounts.google.com.');
    console.log('  PASS Google SSO button rendered inside legacy Settings Cloud section');

    const readyVisible = await page.getByText('Google SSO button is ready.').isVisible({ timeout: 5000 }).catch(() => false);
    assert(readyVisible, 'Prod Pages did not report Google SSO button ready state.');
    console.log('  PASS Web App reports Google SSO ready in legacy Settings');

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
