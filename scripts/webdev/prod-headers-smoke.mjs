const prodPagesUrl = 'https://timewhere-web.pages.dev';

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

console.log('WebDev prod headers smoke');
console.log('============================');

try {
  const { response: indexGet, text: html } = await fetchText(`${prodPagesUrl}/`);
  assert('stable prod Pages HTML is reachable', indexGet.ok, `HTTP ${indexGet.status}`);

  const csp = header(indexGet, 'content-security-policy');
  assert('root response has CSP for Google SSO and prod Worker API',
    csp.includes("frame-ancestors 'none'")
      && csp.includes('https://accounts.google.com')
      && csp.includes('https://*.workers.dev'));
  assert('root response has basic security headers',
    header(indexGet, 'x-content-type-options') === 'nosniff'
      && header(indexGet, 'x-frame-options') === 'DENY'
      && header(indexGet, 'referrer-policy') === 'strict-origin-when-cross-origin'
      && header(indexGet, 'permissions-policy').includes('camera=()'));
  assert('root HTML is no-store', header(indexGet, 'cache-control') === 'no-store');

  const assetPath = html.match(/\/assets\/[^"']+\.js/)?.[0];
  assert('prod HTML references a hashed JS asset', Boolean(assetPath));
  if (assetPath) {
    const assetHead = await fetchHead(new URL(assetPath, prodPagesUrl).href);
    assert('hashed JS asset is reachable', assetHead.ok, `HTTP ${assetHead.status}`);
    assert('hashed JS asset uses immutable cache',
      header(assetHead, 'cache-control') === 'public, max-age=31536000, immutable');
  }

  if (failed > 0) {
    console.error(`\n${failed} prod header checks failed; ${passed} passed.`);
    process.exit(1);
  }

  console.log('============================');
  console.log(`All ${passed} WebDev prod header checks passed.`);
  console.log('Prod Pages headers were checked; no token, account email, Cloudflare id, or local path was printed.');
} catch (error) {
  console.error(error?.message || error);
  process.exit(1);
}
