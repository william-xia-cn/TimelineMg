const previewPagesUrl = 'https://timewhere-preview-web.pages.dev';

let passed = 0;
let failed = 0;

function assert(description, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS ${description}`);
    return;
  }
  failed += 1;
  console.error(`  FAIL ${description}${detail ? `: ${detail}` : ''}`);
}

async function fetchText(url) {
  const response = await fetch(url, { redirect: 'follow' });
  const text = await response.text();
  return { response, text };
}

async function fetchHead(url) {
  return fetch(url, { method: 'HEAD', redirect: 'follow' });
}

function header(response, name) {
  return response.headers.get(name) || '';
}

console.log('WebDev preview headers smoke');
console.log('============================');

try {
  const indexHead = await fetchHead(`${previewPagesUrl}/`);
  assert('stable preview Pages root is reachable', indexHead.ok, `HTTP ${indexHead.status}`);

  const csp = header(indexHead, 'content-security-policy');
  assert('root response has CSP for Google SSO and preview Worker API',
    csp.includes("frame-ancestors 'none'")
      && csp.includes('https://accounts.google.com')
      && csp.includes('https://*.workers.dev'));
  assert('root response has basic security headers',
    header(indexHead, 'x-content-type-options') === 'nosniff'
      && header(indexHead, 'x-frame-options') === 'DENY'
      && header(indexHead, 'referrer-policy') === 'strict-origin-when-cross-origin'
      && header(indexHead, 'permissions-policy').includes('camera=()'));
  assert('root HTML is no-store', header(indexHead, 'cache-control') === 'no-store');

  const { response: indexGet, text: html } = await fetchText(`${previewPagesUrl}/`);
  assert('stable preview Pages HTML is reachable', indexGet.ok, `HTTP ${indexGet.status}`);
  const assetPath = html.match(/\/assets\/[^"']+\.js/)?.[0];
  assert('preview HTML references a hashed JS asset', Boolean(assetPath));
  if (assetPath) {
    const assetHead = await fetchHead(new URL(assetPath, previewPagesUrl).href);
    assert('hashed JS asset is reachable', assetHead.ok, `HTTP ${assetHead.status}`);
    assert('hashed JS asset uses immutable cache',
      header(assetHead, 'cache-control') === 'public, max-age=31536000, immutable');
  }

  if (failed > 0) {
    console.error(`\n${failed} preview header checks failed; ${passed} passed.`);
    process.exit(1);
  }

  console.log('============================');
  console.log(`All ${passed} WebDev preview header checks passed.`);
  console.log('No prod resources were touched; no token, account email, Cloudflare id, or local path was printed.');
} catch (error) {
  console.error(error?.message || error);
  process.exit(1);
}
