const { app, net, safeStorage, shell } = require('electron');
const crypto = require('crypto');
const fs = require('fs/promises');
const http = require('http');
const path = require('path');

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';
const DEFAULT_SCOPES = ['openid', 'profile', 'email', 'https://www.googleapis.com/auth/drive.appdata'];
const STATE_FILE = 'google-desktop-auth.json';
const STATE_SCHEMA = 'timewhere-desktop-google-auth-v2';
const DEFAULT_DESKTOP_OAUTH_CLIENT_ID = [
  '541406150907',
  '0koum8v8mms5d4lrnhuavuh5b55hhben.apps.googleusercontent.com'
].join('-');
let DEFAULT_DESKTOP_OAUTH_CLIENT_SECRET = '';
let DEFAULT_DESKTOP_OAUTH_SECRET_MODULE_LOADED = false;
try {
  ({ DEFAULT_DESKTOP_OAUTH_CLIENT_SECRET } = require('./desktop-oauth-secrets'));
  DEFAULT_DESKTOP_OAUTH_SECRET_MODULE_LOADED = true;
} catch (_) {
  DEFAULT_DESKTOP_OAUTH_CLIENT_SECRET = '';
}

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

function sha256Hex(text) {
  return crypto.createHash('sha256').update(String(text || '')).digest('hex');
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

function getDesktopOAuthCredentials() {
  const clientId = getDesktopOAuthClientId();
  return {
    clientId,
    clientSecret: clientId === DEFAULT_DESKTOP_OAUTH_CLIENT_ID
      ? DEFAULT_DESKTOP_OAUTH_CLIENT_SECRET
      : ''
  };
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

function makeAuthError(message, code, details = {}) {
  const error = new Error(message);
  error.code = code;
  for (const [key, value] of Object.entries(details || {})) {
    if (value != null) error[key] = value;
  }
  return error;
}

function getClientIdTail(clientId = '') {
  const normalized = String(clientId || '').trim();
  const localPart = normalized.replace(/\.apps\.googleusercontent\.com$/i, '');
  return localPart ? localPart.slice(-8) : '';
}

function getOauthFingerprint(value = '') {
  const text = String(value || '');
  return text ? sha256Hex(`timewhere-oauth-diagnostic:${text}`).slice(0, 12) : null;
}

function getOAuthConfigDiagnostics(credentials = getDesktopOAuthCredentials()) {
  const clientId = credentials.clientId || '';
  const clientSecret = credentials.clientSecret || '';
  const envClientId = String(process.env.TIMEWHERE_GOOGLE_DESKTOP_CLIENT_ID || '').trim();
  return {
    status: 'ok',
    auth_mode: clientSecret
      ? 'pkce_desktop_client_metadata_secret'
      : 'pkce_public_client_override',
    client_id_tail: getClientIdTail(clientId),
    client_id_fingerprint: getOauthFingerprint(clientId),
    env_client_id_override: Boolean(envClientId),
    client_secret_present: Boolean(clientSecret),
    client_secret_fingerprint: getOauthFingerprint(clientSecret),
    bundled_client_secret_present: Boolean(DEFAULT_DESKTOP_OAUTH_CLIENT_SECRET),
    bundled_secret_module_loaded: DEFAULT_DESKTOP_OAUTH_SECRET_MODULE_LOADED,
    scopes: DEFAULT_SCOPES.slice()
  };
}

function getDesktopFetchImpl(fetchImpl = null) {
  if (typeof fetchImpl === 'function') return fetchImpl;
  if (net && typeof net.fetch === 'function') return net.fetch.bind(net);
  return global.fetch;
}

function createDesktopAuth({ fetchImpl = null } = {}) {
  let memoryAccessToken = null;

  function getStatePath() {
    return path.join(app.getPath('userData'), STATE_FILE);
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
    const state = normalizeAuthState(await readState());
    const activeKey = state.active_account_key;
    if (activeKey && state.accounts?.[activeKey]) {
      state.accounts[activeKey] = {
        ...state.accounts[activeKey],
        encrypted_refresh_token: null,
        disconnected_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      await writeState(state);
      return;
    }
    await writeState({
      schema: STATE_SCHEMA,
      active_account_key: null,
      accounts: {},
      updated_at: new Date().toISOString()
    });
  }

  function classifyRefreshTokenFailure(error = {}) {
    const code = String(error.code || error.google_error || '');
    const message = String(error.message || '');
    const subtype = String(error.google_error_subtype || '');
    if (code !== 'invalid_grant' && !/invalid_grant|expired or revoked/i.test(message)) {
      return null;
    }
    if (subtype === 'invalid_rapt') {
      return {
        reason: 'desktop_oauth_session_control_required',
        message: 'Google Workspace session policy requires reauthorization before TimeWhere can sync again.'
      };
    }
    return {
      reason: 'desktop_oauth_refresh_token_revoked',
      message: 'Google authorization expired, was revoked, or no longer matches this desktop package OAuth client metadata. Please reconnect Google.'
    };
  }

  async function markStoredRefreshTokenInvalid(reason, error = {}) {
    memoryAccessToken = null;
    const state = normalizeAuthState(await readState());
    const activeKey = state.active_account_key;
    const now = new Date().toISOString();
    if (activeKey && state.accounts?.[activeKey]) {
      state.accounts[activeKey] = {
        ...state.accounts[activeKey],
        encrypted_refresh_token: null,
        disconnected_at: state.accounts[activeKey].disconnected_at || now,
        updated_at: now,
        last_token_error_reason: reason,
        last_token_error_code: error.code || error.google_error || null,
        last_token_error_subtype: error.google_error_subtype || null,
        last_token_error_at: now
      };
      state.updated_at = now;
      await writeState(state);
      return state.accounts[activeKey];
    }
    if (state.legacy?.encrypted_refresh_token) {
      state.legacy = {
        ...state.legacy,
        encrypted_refresh_token: null,
        disconnected_at: state.legacy.disconnected_at || now,
        updated_at: now,
        last_token_error_reason: reason,
        last_token_error_code: error.code || error.google_error || null,
        last_token_error_subtype: error.google_error_subtype || null,
        last_token_error_at: now
      };
      state.updated_at = now;
      await writeState(state);
      return null;
    }
    return null;
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

  function normalizeAuthState(state = {}) {
    if (state?.schema === STATE_SCHEMA) {
      return {
        schema: STATE_SCHEMA,
        active_account_key: state.active_account_key || null,
        accounts: state.accounts && typeof state.accounts === 'object' ? { ...state.accounts } : {},
        updated_at: state.updated_at || null
      };
    }
    return {
      schema: STATE_SCHEMA,
      active_account_key: null,
      accounts: {},
      legacy: state?.encrypted_refresh_token ? { ...state } : null,
      updated_at: state?.updated_at || null
    };
  }

  function publicAccountInfo(account = null, connected = false) {
    if (!account) {
      return { status: 'not_connected', connected: false, account_key: null, name: null, email: null, picture: null };
    }
    return {
      status: connected ? 'connected' : 'disconnected',
      connected: Boolean(connected),
      account_key: account.account_key || null,
      name: account.name || null,
      email: account.email || null,
      picture: account.picture || null
    };
  }

  function getActiveAccount(state = normalizeAuthState()) {
    const activeKey = state.active_account_key;
    if (!activeKey) return null;
    return state.accounts?.[activeKey] || null;
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
    const tokenFetch = getDesktopFetchImpl(fetchImpl);
    if (typeof tokenFetch !== 'function') {
      throw makeAuthError('Fetch implementation is unavailable for Google OAuth', 'desktop_oauth_fetch_unavailable');
    }
    let response = null;
    try {
      response = await tokenFetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body).toString()
      });
    } catch (error) {
      throw makeAuthError(
        `Google OAuth token network request failed: ${error.message || 'fetch failed'}`,
        'desktop_oauth_network_failed'
      );
    }
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const googleError = json.error || `http_${response.status}`;
      const googleMessage = json.error_description || json.error || 'unknown error';
      throw makeAuthError(
        `Google OAuth token request failed (${response.status}): ${googleMessage}`,
        googleError,
        {
          http_status: response.status,
          google_error: json.error || null,
          google_error_description: json.error_description || null,
          google_error_subtype: json.error_subtype || null
        }
      );
    }
    return json;
  }

  async function requestGoogleUserInfo(accessToken) {
    const userInfoFetch = getDesktopFetchImpl(fetchImpl);
    if (typeof userInfoFetch !== 'function') {
      throw makeAuthError('Fetch implementation is unavailable for Google account info', 'desktop_oauth_fetch_unavailable');
    }
    let response = null;
    try {
      response = await userInfoFetch(USERINFO_ENDPOINT, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
    } catch (error) {
      throw makeAuthError(
        `Google account info request failed: ${error.message || 'fetch failed'}`,
        'desktop_oauth_account_info_failed'
      );
    }
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorCode = json.error || `http_${response.status}`;
      throw makeAuthError(
        `Google account info request failed (${response.status}): ${json.error_description || json.error || 'unknown error'}`,
        errorCode === 'invalid_token' ? 'desktop_oauth_account_required' : 'desktop_oauth_account_info_failed'
      );
    }
    if (!json.sub) {
      throw makeAuthError('Google account info response is missing subject', 'desktop_oauth_account_required');
    }
    return {
      account_key: sha256Hex(json.sub),
      name: json.name || null,
      email: json.email || null,
      picture: json.picture || null
    };
  }

  async function persistAuthorizedAccount(tokenResponse, scopes, previousState = {}, fallbackRefreshToken = null) {
    const token = rememberAccessToken(tokenResponse);
    const accountInfo = await requestGoogleUserInfo(token.token);
    const state = normalizeAuthState(previousState);
    const existing = state.accounts?.[accountInfo.account_key] || {};
    const refreshToken = tokenResponse.refresh_token
      || fallbackRefreshToken
      || (existing.encrypted_refresh_token ? decryptRefreshToken(existing) : null);
    if (!refreshToken) {
      throw new Error('Google OAuth did not return a refresh token; please retry authorization.');
    }
    state.accounts = state.accounts || {};
    state.accounts[accountInfo.account_key] = {
      ...existing,
      ...accountInfo,
      encrypted_refresh_token: encryptRefreshToken(refreshToken),
      connected_at: existing.connected_at || new Date().toISOString(),
      disconnected_at: null,
      updated_at: new Date().toISOString(),
      scopes
    };
    state.active_account_key = accountInfo.account_key;
    state.updated_at = new Date().toISOString();
    delete state.legacy;
    await writeState(state);
    return accountInfo;
  }

  async function refreshAccessToken(credentials, refreshToken) {
    const tokenResponse = await requestToken(compactObject({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    }));
    rememberAccessToken(tokenResponse);
    return { token: memoryAccessToken, tokenResponse };
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

  async function interactiveAuthorize(credentials, scopes, options = {}) {
    const pkce = makePkcePair();
    const state = base64Url(crypto.randomBytes(24));
    const authServer = startAuthorizationServer(state);
    const port = await authServer.listeningPromise;
    const redirectUri = `http://127.0.0.1:${port}/oauth2/callback`;
    const authorizationUrl = new URL(AUTH_ENDPOINT);
    authorizationUrl.searchParams.set('client_id', credentials.clientId);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('redirect_uri', redirectUri);
    authorizationUrl.searchParams.set('scope', scopes.join(' '));
    authorizationUrl.searchParams.set('state', state);
    authorizationUrl.searchParams.set('code_challenge', pkce.challenge);
    authorizationUrl.searchParams.set('code_challenge_method', 'S256');
    authorizationUrl.searchParams.set('access_type', 'offline');
    const promptValue = options.force_account_selection
      ? 'select_account consent'
      : (options.force_consent ? 'consent' : '');
    if (promptValue) authorizationUrl.searchParams.set('prompt', promptValue);
    await shell.openExternal(authorizationUrl.toString());
    const code = await authServer.codePromise;
    const tokenResponse = await requestToken(compactObject({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      code,
      code_verifier: pkce.verifier,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    }));
    const previousState = await readState();
    const normalized = normalizeAuthState(previousState);
    const legacyRefreshToken = normalized.legacy?.encrypted_refresh_token ? decryptRefreshToken(normalized.legacy) : null;
    const accountInfo = await persistAuthorizedAccount(tokenResponse, scopes, previousState, legacyRefreshToken);
    return { token: memoryAccessToken, accountInfo };
  }

  async function getGoogleToken(options = {}) {
    const credentials = getDesktopOAuthCredentials();
    if (!credentials.clientId) return { status: 'not_configured', reason: 'desktop_oauth_client_id_missing' };
    const scopes = Array.isArray(options.scopes) && options.scopes.length ? options.scopes : DEFAULT_SCOPES;
    const state = await readState();
    const normalized = normalizeAuthState(state);
    const activeAccount = getActiveAccount(normalized);
    if (!options.force_account_selection && memoryAccessToken && memoryAccessToken.expires_at > Date.now() && activeAccount?.account_key) {
      return { status: 'ok', token: memoryAccessToken.token, account_info: publicAccountInfo(activeAccount, Boolean(activeAccount.encrypted_refresh_token)) };
    }
    let refreshToken = null;
    let refreshAccount = activeAccount;
    let forceConsentForInteractive = false;
    try {
      if (!options.force_account_selection && activeAccount?.encrypted_refresh_token) {
        refreshToken = decryptRefreshToken(activeAccount);
      } else if (!options.force_account_selection && normalized.legacy?.encrypted_refresh_token) {
        refreshToken = decryptRefreshToken(normalized.legacy);
        refreshAccount = null;
      }
    } catch (error) {
      if (!options.interactive) {
        return {
          status: 'not_authorized',
          reason: error.code || 'desktop_oauth_saved_token_unreadable',
          message: error.message
        };
      }
      await clearState();
      forceConsentForInteractive = true;
    }
    if (refreshToken) {
      try {
        const refreshed = await refreshAccessToken(credentials, refreshToken);
        if (refreshAccount?.account_key) {
          return { status: 'ok', token: refreshed.token.token, account_info: publicAccountInfo(refreshAccount, true) };
        }
        if (!options.interactive) {
          return {
            status: 'not_authorized',
            reason: 'desktop_oauth_account_required',
            message: 'Desktop Google authorization must be reconnected once to identify the account for local data isolation.'
          };
        }
        await clearState();
        forceConsentForInteractive = true;
      } catch (error) {
        const tokenFailure = classifyRefreshTokenFailure(error);
        if (tokenFailure) {
          const invalidAccount = await markStoredRefreshTokenInvalid(tokenFailure.reason, error);
          const accountInfo = invalidAccount || refreshAccount;
          const result = {
            status: 'not_authorized',
            reason: tokenFailure.reason,
            message: tokenFailure.message,
            google_error: error.google_error || error.code || null,
            google_error_subtype: error.google_error_subtype || null,
            oauth_diagnostics: getOAuthConfigDiagnostics(credentials),
            account_info: publicAccountInfo(accountInfo, false)
          };
          if (!options.interactive) return result;
          refreshToken = null;
          refreshAccount = accountInfo;
          forceConsentForInteractive = true;
        } else {
          if (!options.interactive) throw error;
          await clearState();
          forceConsentForInteractive = true;
        }
      }
    }
    if (!options.interactive) return { status: 'not_authorized', reason: 'desktop_oauth_not_connected' };
    if (!hasEncryptedStorage()) {
      throw makeAuthError(
        'Desktop token storage encryption is unavailable; cannot connect Google sync without saving a plaintext refresh token.',
        'desktop_token_storage_unavailable'
      );
    }
    const authorized = await interactiveAuthorize(credentials, scopes, {
      ...options,
      force_consent: options.force_consent === true || options.force_account_selection === true || forceConsentForInteractive || !refreshToken
    });
    return { status: 'ok', token: authorized.token.token, account_info: publicAccountInfo(authorized.accountInfo, true) };
  }

  async function revokeGoogleToken() {
    const clientId = getDesktopOAuthClientId();
    const state = normalizeAuthState(await readState());
    const activeAccount = getActiveAccount(state);
    const refreshToken = activeAccount?.encrypted_refresh_token ? decryptRefreshToken(activeAccount) : null;
    const token = memoryAccessToken?.token || refreshToken;
    const tokenFetch = getDesktopFetchImpl(fetchImpl);
    if (token && clientId && typeof tokenFetch === 'function') {
      await tokenFetch(REVOKE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }).toString()
      }).catch(() => null);
    }
    await clearState();
    return { status: 'revoked' };
  }

  async function disconnectGoogleToken() {
    await clearState();
    return { status: 'disconnected' };
  }

  return {
    async getStatus() {
      const credentials = getDesktopOAuthCredentials();
      if (!credentials.clientId) return { status: 'not_configured', reason: 'desktop_oauth_client_id_missing' };
      const state = normalizeAuthState(await readState());
      const activeAccount = getActiveAccount(state);
      return {
        status: 'configured',
        auth_mode: credentials.clientSecret
          ? 'pkce_desktop_client_metadata_secret'
          : 'pkce_public_client_override',
        connected: Boolean(activeAccount?.encrypted_refresh_token),
        account_info: publicAccountInfo(activeAccount, Boolean(activeAccount?.encrypted_refresh_token)),
        encrypted_storage_available: hasEncryptedStorage()
      };
    },
    async getDiagnostics() {
      const credentials = getDesktopOAuthCredentials();
      const state = normalizeAuthState(await readState());
      const activeAccount = getActiveAccount(state);
      return {
        status: 'ok',
        oauth: getOAuthConfigDiagnostics(credentials),
        state: {
          schema: state.schema,
          account_count: Object.keys(state.accounts || {}).length,
          has_active_account: Boolean(activeAccount),
          active_account_key_fingerprint: activeAccount?.account_key ? getOauthFingerprint(activeAccount.account_key) : null,
          active_has_refresh_token: Boolean(activeAccount?.encrypted_refresh_token),
          active_connected_at: activeAccount?.connected_at || null,
          active_disconnected_at: activeAccount?.disconnected_at || null,
          active_updated_at: activeAccount?.updated_at || null,
          active_last_token_error_reason: activeAccount?.last_token_error_reason || null,
          active_last_token_error_subtype: activeAccount?.last_token_error_subtype || null,
          legacy_has_refresh_token: Boolean(state.legacy?.encrypted_refresh_token)
        }
      };
    },
    getGoogleToken,
    async getAccountInfo() {
      const state = normalizeAuthState(await readState());
      const activeAccount = getActiveAccount(state);
      return publicAccountInfo(activeAccount, Boolean(activeAccount?.encrypted_refresh_token));
    },
    disconnectGoogleToken,
    revokeGoogleToken
  };
}

module.exports = { createDesktopAuth, DEFAULT_SCOPES };
