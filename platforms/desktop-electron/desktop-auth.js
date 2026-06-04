const { app, safeStorage, shell } = require('electron');
const crypto = require('crypto');
const fs = require('fs/promises');
const http = require('http');
const path = require('path');

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const DEFAULT_SCOPES = ['https://www.googleapis.com/auth/drive.appdata'];
const STATE_FILE = 'google-desktop-auth.json';
const LOCAL_OAUTH_CONFIG_FILE = 'desktop-oauth.local.json';
const DEFAULT_DESKTOP_OAUTH_CLIENT_ID = '541406150907-0koum8v8mms5d4lrnhuavuh5b55hhben.apps.googleusercontent.com';

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest();
}

function makePkcePair() {
  const verifier = base64Url(crypto.randomBytes(32));
  return {
    verifier,
    challenge: base64Url(sha256(verifier))
  };
}

function getDesktopOAuthClientId() {
  return String(process.env.TIMEWHERE_GOOGLE_DESKTOP_CLIENT_ID || DEFAULT_DESKTOP_OAUTH_CLIENT_ID).trim();
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item != null && item !== ''));
}

function hasEncryptedStorage() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch (_) {
    return false;
  }
}

function makeAuthError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function createDesktopAuth({ fetchImpl = global.fetch } = {}) {
  let memoryAccessToken = null;

  function getStatePath() {
    return path.join(app.getPath('userData'), STATE_FILE);
  }

  function getLocalOAuthConfigPaths() {
    return [
      process.env.TIMEWHERE_GOOGLE_DESKTOP_OAUTH_CONFIG,
      path.join(app.getPath('userData'), LOCAL_OAUTH_CONFIG_FILE),
      process.env.PORTABLE_EXECUTABLE_DIR ? path.join(process.env.PORTABLE_EXECUTABLE_DIR, LOCAL_OAUTH_CONFIG_FILE) : null,
      path.join(path.dirname(process.execPath), LOCAL_OAUTH_CONFIG_FILE),
      process.resourcesPath ? path.join(process.resourcesPath, LOCAL_OAUTH_CONFIG_FILE) : null,
      path.join(__dirname, LOCAL_OAUTH_CONFIG_FILE)
    ].filter(Boolean);
  }

  async function readJsonFileIfExists(filePath) {
    try {
      const text = await fs.readFile(filePath, 'utf8');
      const json = JSON.parse(text);
      return json && typeof json === 'object' ? json : {};
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      throw error;
    }
  }

  async function readDesktopOAuthConfig() {
    let fileConfig = {};
    for (const filePath of getLocalOAuthConfigPaths()) {
      fileConfig = await readJsonFileIfExists(filePath);
      if (fileConfig.client_id || fileConfig.client_secret) break;
    }
    return compactObject({
      client_id: String(process.env.TIMEWHERE_GOOGLE_DESKTOP_CLIENT_ID || fileConfig.client_id || DEFAULT_DESKTOP_OAUTH_CLIENT_ID).trim(),
      client_secret: String(process.env.TIMEWHERE_GOOGLE_DESKTOP_CLIENT_SECRET || fileConfig.client_secret || '').trim()
    });
  }

  async function readState() {
    try {
      const text = await fs.readFile(getStatePath(), 'utf8');
      const state = JSON.parse(text);
      return state && typeof state === 'object' ? state : {};
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      throw error;
    }
  }

  async function writeState(state) {
    await fs.mkdir(path.dirname(getStatePath()), { recursive: true });
    await fs.writeFile(getStatePath(), JSON.stringify(state, null, 2), 'utf8');
  }

  async function clearState() {
    memoryAccessToken = null;
    try {
      await fs.unlink(getStatePath());
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  function encryptRefreshToken(refreshToken) {
    if (!refreshToken) return null;
    if (!hasEncryptedStorage()) {
      throw makeAuthError(
        'Desktop token storage encryption is unavailable; refusing to save a plaintext refresh token.',
        'desktop_token_storage_unavailable'
      );
    }
    return safeStorage.encryptString(refreshToken).toString('base64');
  }

  function decryptRefreshToken(state) {
    if (!state?.encrypted_refresh_token) return null;
    if (!hasEncryptedStorage()) {
      throw makeAuthError(
        'Desktop token storage encryption is unavailable; cannot read saved Google authorization.',
        'desktop_token_storage_unavailable'
      );
    }
    try {
      return safeStorage.decryptString(Buffer.from(state.encrypted_refresh_token, 'base64'));
    } catch (error) {
      throw makeAuthError(
        `Saved desktop Google authorization cannot be decrypted: ${error.message}`,
        'desktop_oauth_saved_token_unreadable'
      );
    }
  }

  function rememberAccessToken(tokenResponse) {
    if (!tokenResponse?.access_token) return null;
    const expiresInSeconds = Number(tokenResponse.expires_in || 3600);
    memoryAccessToken = {
      token: tokenResponse.access_token,
      expires_at: Date.now() + Math.max(60, expiresInSeconds - 60) * 1000
    };
    return memoryAccessToken;
  }

  async function requestToken(body) {
    if (typeof fetchImpl !== 'function') throw new Error('Fetch implementation is unavailable for Google OAuth');
    const response = await fetchImpl(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString()
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorCode = json.error || `http_${response.status}`;
      throw makeAuthError(
        `Google OAuth token request failed (${response.status}): ${json.error_description || json.error || 'unknown error'}`,
        errorCode
      );
    }
    return json;
  }

  async function refreshAccessToken(clientId, refreshToken) {
    const config = await readDesktopOAuthConfig();
    const tokenResponse = await requestToken(compactObject({
      client_id: clientId,
      client_secret: config.client_secret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    }));
    rememberAccessToken(tokenResponse);
    return memoryAccessToken;
  }

  function startAuthorizationServer(expectedState, timeoutMs = 90000) {
    const server = http.createServer();
    let timeout = null;
    const codePromise = new Promise((resolve, reject) => {
      function cleanup() {
        clearTimeout(timeout);
        server.close();
      }
      server.on('request', (request, response) => {
        try {
          const url = new URL(request.url, 'http://127.0.0.1');
          if (url.pathname !== '/oauth2/callback') {
            response.writeHead(404);
            response.end('Not found');
            return;
          }
          const returnedState = url.searchParams.get('state');
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');
          const errorDescription = url.searchParams.get('error_description');
          response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          response.end('<!doctype html><meta charset="utf-8"><title>TimeWhere</title><p>TimeWhere Google authorization finished. You can close this window.</p>');
          cleanup();
          if (error) {
            reject(makeAuthError(
              `Google OAuth authorization failed: ${errorDescription || error}`,
              error
            ));
            return;
          }
          if (returnedState !== expectedState || !code) {
            reject(makeAuthError('Google OAuth authorization state mismatch', 'state_mismatch'));
            return;
          }
          resolve(code);
        } catch (err) {
          cleanup();
          reject(err);
        }
      });
      timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Google OAuth authorization timed out'));
      }, timeoutMs);
    });
    const listeningPromise = new Promise((resolve, reject) => {
      server.once('error', error => {
        clearTimeout(timeout);
        reject(error);
      });
      server.listen(0, '127.0.0.1', () => resolve(server.address().port));
    });
    return { listeningPromise, codePromise };
  }

  async function interactiveAuthorize(clientId, scopes) {
    const pkce = makePkcePair();
    const state = base64Url(crypto.randomBytes(24));
    const authServer = startAuthorizationServer(state);
    const port = await authServer.listeningPromise;
    const redirectUri = `http://127.0.0.1:${port}/oauth2/callback`;
    const authorizationUrl = new URL(AUTH_ENDPOINT);
    authorizationUrl.searchParams.set('client_id', clientId);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('redirect_uri', redirectUri);
    authorizationUrl.searchParams.set('scope', scopes.join(' '));
    authorizationUrl.searchParams.set('state', state);
    authorizationUrl.searchParams.set('code_challenge', pkce.challenge);
    authorizationUrl.searchParams.set('code_challenge_method', 'S256');
    authorizationUrl.searchParams.set('access_type', 'offline');
    authorizationUrl.searchParams.set('prompt', 'consent');
    await shell.openExternal(authorizationUrl.toString());
    const code = await authServer.codePromise;
    const config = await readDesktopOAuthConfig();
    const tokenResponse = await requestToken(compactObject({
      client_id: clientId,
      client_secret: config.client_secret,
      code,
      code_verifier: pkce.verifier,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    }));
    rememberAccessToken(tokenResponse);
    const previousState = await readState();
    const refreshToken = tokenResponse.refresh_token || decryptRefreshToken(previousState);
    if (!refreshToken) {
      throw new Error('Google OAuth did not return a refresh token; please retry authorization.');
    }
    await writeState({
      schema: 'timewhere-desktop-google-auth-v1',
      encrypted_refresh_token: encryptRefreshToken(refreshToken),
      connected_at: previousState.connected_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      scopes
    });
    return memoryAccessToken;
  }

  async function getGoogleToken(options = {}) {
    const config = await readDesktopOAuthConfig();
    const clientId = config.client_id || getDesktopOAuthClientId();
    if (!clientId) return { status: 'not_configured', reason: 'desktop_oauth_client_id_missing' };
    if (memoryAccessToken && memoryAccessToken.expires_at > Date.now()) {
      return { status: 'ok', token: memoryAccessToken.token };
    }
    const scopes = Array.isArray(options.scopes) && options.scopes.length ? options.scopes : DEFAULT_SCOPES;
    const state = await readState();
    let refreshToken = null;
    try {
      refreshToken = decryptRefreshToken(state);
    } catch (error) {
      if (!options.interactive) {
        return {
          status: 'not_authorized',
          reason: error.code || 'desktop_oauth_saved_token_unreadable',
          message: error.message
        };
      }
      await clearState();
    }
    if (refreshToken) {
      try {
        await refreshAccessToken(clientId, refreshToken);
        return { status: 'ok', token: memoryAccessToken.token };
      } catch (error) {
        if (!options.interactive) throw error;
        await clearState();
      }
    }
    if (!options.interactive) return { status: 'not_authorized', reason: 'desktop_oauth_not_connected' };
    if (!hasEncryptedStorage()) {
      throw makeAuthError(
        'Desktop token storage encryption is unavailable; cannot connect Google sync without saving a plaintext refresh token.',
        'desktop_token_storage_unavailable'
      );
    }
    await interactiveAuthorize(clientId, scopes);
    return { status: 'ok', token: memoryAccessToken.token };
  }

  async function revokeGoogleToken() {
    const config = await readDesktopOAuthConfig();
    const clientId = config.client_id || getDesktopOAuthClientId();
    const state = await readState();
    const refreshToken = state?.encrypted_refresh_token ? decryptRefreshToken(state) : null;
    const token = memoryAccessToken?.token || refreshToken;
    if (token && clientId && typeof fetchImpl === 'function') {
      await fetchImpl(REVOKE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }).toString()
      }).catch(() => null);
    }
    await clearState();
    return { status: 'revoked' };
  }

  return {
    async getStatus() {
      const config = await readDesktopOAuthConfig();
      const clientId = config.client_id || getDesktopOAuthClientId();
      if (!clientId) return { status: 'not_configured', reason: 'desktop_oauth_client_id_missing' };
      const state = await readState();
      return {
        status: 'configured',
        connected: Boolean(state?.encrypted_refresh_token),
        encrypted_storage_available: hasEncryptedStorage(),
        client_secret_configured: Boolean(config.client_secret)
      };
    },
    getGoogleToken,
    async getAccountInfo() {
      return { email: null };
    },
    revokeGoogleToken
  };
}

module.exports = { createDesktopAuth, DEFAULT_SCOPES };
