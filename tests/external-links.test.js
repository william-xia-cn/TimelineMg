/**
 * External HTTP link helper tests.
 * Run: node tests/external-links.test.js
 */

const ExternalLinks = require('../extension/shared/js/external-links.js');

let passed = 0;
let failed = 0;

function assert(desc, condition) {
    if (condition) {
        passed++;
        console.log(`  PASS ${desc}`);
    } else {
        failed++;
        console.log(`  FAIL ${desc}`);
    }
}

function assertEqual(desc, got, expected) {
    assert(`${desc} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(expected));
}

console.log('\nTimeWhere external link helper tests\n' + '='.repeat(44));

assertEqual('normalize accepts https URL', ExternalLinks.normalizeHttpUrl('https://example.invalid/path?q=1'), 'https://example.invalid/path?q=1');
assertEqual('normalize accepts http URL', ExternalLinks.normalizeHttpUrl('http://example.invalid'), 'http://example.invalid/');
assertEqual('normalize rejects javascript URL', ExternalLinks.normalizeHttpUrl('javascript:alert(1)'), null);
assertEqual('normalize rejects file URL', ExternalLinks.normalizeHttpUrl('file:///tmp/private'), null);
assertEqual('normalize trims trailing punctuation', ExternalLinks.normalizeHttpUrl('https://example.invalid/path).'), 'https://example.invalid/path');

const extracted = ExternalLinks.extractHttpLinks(`
    See https://one.example.invalid/a, then http://two.example.invalid/b).
    Ignore javascript:alert(1), file:///tmp/a, and duplicate https://one.example.invalid/a
`);
assertEqual('extract returns unique http/https links in order', extracted, [
    'https://one.example.invalid/a',
    'http://two.example.invalid/b'
]);

const rendered = ExternalLinks.renderExternalLinkList('Open https://example.invalid/?a=1&b=2 <img src=x onerror=alert(1)>');
assert('render outputs external link buttons', rendered.includes('data-action="open-external-link"') && rendered.includes('external-link-item'));
assert('render escapes URL attributes and text', rendered.includes('a=1&amp;b=2') && !rendered.includes('<img'));
assert('render returns empty string when no supported links exist', ExternalLinks.renderExternalLinkList('no links javascript:alert(1)') === '');

console.log('\n' + '='.repeat(44));
console.log(`Total: ${passed + failed} checks   PASS ${passed}   ${failed > 0 ? 'FAIL' : 'PASS'} ${failed}`);
if (failed > 0) process.exit(1);
