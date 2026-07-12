const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`  PASS ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}`);
  }
}

console.log('\nTimeWhere macOS internal installer checks');
console.log('==========================================');

const rootInstaller = read('scripts/release/install-mac-internal-root.sh');
const dmgBuilder = read('scripts/release/build-mac-internal-installer-dmg.sh');
const installerApp = read('scripts/release/Install TimeWhere.js');
const workflow = read('.github/workflows/timewhere-desktop-mac.yml');

check('installer pins the approved certificate SHA256',
  rootInstaller.includes('9dd8abe0acc893bf30495f494cea8cf7b404b90120d5f986e3551ee47fdf96bf'));
check('installer pins the TimeWhere bundle identifier',
  rootInstaller.includes('cn.williamxia.timewhere'));
check('installer trusts only code signing in the System keychain',
  rootInstaller.includes('-p codeSign') && rootInstaller.includes('/Library/Keychains/System.keychain'));
check('installer verifies deep strict signature before replacement',
  rootInstaller.includes('codesign --verify --deep --strict'));
check('installer requires both Universal architectures',
  rootInstaller.includes('x86_64') && rootInstaller.includes('arm64'));
check('installer has rollback behavior for an existing app',
  rootInstaller.includes('.TimeWhere.backup.') && rootInstaller.includes('mv "$backup_app" "$TARGET_APP"'));
check('quarantine removal is limited to the TimeWhere target',
  rootInstaller.includes('xattr -dr com.apple.quarantine "$TARGET_APP"'));
check('installer never disables Gatekeeper',
  !rootInstaller.includes('spctl --master-disable'));
check('DMG builder rejects private certificate bundles',
  dmgBuilder.includes('Private certificate bundle must not be present'));
check('DMG builder verifies its mounted payload',
  dmgBuilder.includes('hdiutil attach') && dmgBuilder.includes('codesign --verify --deep --strict'));
check('native installer requests one administrator authorization',
  installerApp.includes('administratorPrivileges: true'));
check('workflow builds the internal installer DMG',
  workflow.includes('build-mac-internal-installer-dmg.sh'));

console.log(`\nTotal: ${passed + failed} checks   PASS ${passed}   FAIL ${failed}`);
if (failed > 0) process.exit(1);
