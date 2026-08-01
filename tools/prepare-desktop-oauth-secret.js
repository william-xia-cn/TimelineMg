#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const desktopDir = path.join(projectRoot, 'platforms', 'desktop-electron');
const outputPath = path.join(desktopDir, 'desktop-oauth-secrets.js');
const localConfigPath = path.join(desktopDir, 'desktop-oauth.local.json');
const placeholder = 'PASTE_TIMEWHERE_DESKTOP_CLIENT_SECRET_HERE';

function existingSecret() {
  if (!fs.existsSync(outputPath)) return '';
  const match = fs.readFileSync(outputPath, 'utf8')
    .match(/DEFAULT_DESKTOP_OAUTH_CLIENT_SECRET:\s*(['"])(.+?)\1/);
  return match ? match[2] : '';
}

function localConfigSecret() {
  if (!fs.existsSync(localConfigPath)) return '';
  const config = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
  return String(config.client_secret || config.installed?.client_secret || '');
}

const secret = String(
  process.env.TIMEWHERE_GOOGLE_DESKTOP_CLIENT_SECRET
    || existingSecret()
    || localConfigSecret()
).trim();

if (!secret || secret === placeholder) {
  throw new Error(
    'Desktop OAuth client secret is required for internal desktop packaging. '
    + 'Set TIMEWHERE_GOOGLE_DESKTOP_CLIENT_SECRET or create '
    + 'platforms/desktop-electron/desktop-oauth.local.json.'
  );
}

fs.writeFileSync(
  outputPath,
  `module.exports = {\n  DEFAULT_DESKTOP_OAUTH_CLIENT_SECRET: ${JSON.stringify(secret)}\n};\n`,
  { encoding: 'utf8', mode: 0o600 }
);
console.log('Desktop OAuth secret module prepared.');
