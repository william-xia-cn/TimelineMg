import { HttpError } from './http';
import { newId, nowISO, sha256Hex } from './crypto';
import type { Env, GoogleIdentity, SessionContext } from './types';

interface TokenInfoResponse {
  sub?: string;
  aud?: string;
  email?: string;
  name?: string;
  picture?: string;
  error?: string;
}

export async function verifyGoogleIdToken(env: Env, idToken: string): Promise<GoogleIdentity> {
  if (!env.GOOGLE_OIDC_CLIENT_ID) {
    throw new HttpError(503, 'auth_not_configured', 'Google SSO is not configured for this environment');
  }
  if (!idToken || typeof idToken !== 'string') {
    throw new HttpError(400, 'missing_id_token', 'Google id_token is required');
  }

  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!response.ok) {
    throw new HttpError(401, 'invalid_google_token', 'Google identity token could not be verified');
  }
  const tokenInfo = await response.json() as TokenInfoResponse;
  if (tokenInfo.error || !tokenInfo.sub) {
    throw new HttpError(401, 'invalid_google_token', 'Google identity token is invalid');
  }
  if (tokenInfo.aud !== env.GOOGLE_OIDC_CLIENT_ID) {
    throw new HttpError(401, 'google_audience_mismatch', 'Google identity token audience does not match this app');
  }

  return {
    sub: tokenInfo.sub,
    email: tokenInfo.email,
    name: tokenInfo.name || 'Google User',
    picture: tokenInfo.picture
  };
}

export async function upsertAccount(env: Env, identity: GoogleIdentity): Promise<{ accountId: string }> {
  const now = nowISO();
  const existing = await env.DB
    .prepare('SELECT id FROM accounts WHERE google_sub = ?')
    .bind(identity.sub)
    .first<{ id: string }>();
  if (existing?.id) {
    await env.DB.prepare('UPDATE accounts SET email = ?, display_name = ?, picture_url = ?, updated_at = ? WHERE id = ?')
      .bind(identity.email || null, identity.name || null, identity.picture || null, now, existing.id)
      .run();
    return { accountId: existing.id };
  }

  const accountId = newId('acct');
  await env.DB.prepare(
    'INSERT INTO accounts (id, google_sub, email, display_name, picture_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(accountId, identity.sub, identity.email || null, identity.name || null, identity.picture || null, now, now).run();
  await env.DB.prepare(
    'INSERT INTO user_profiles (id, account_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(newId('profile'), accountId, 'Personal Workspace', now, now).run();
  return { accountId };
}

export async function loadAccountBundle(env: Env, accountId: string): Promise<Record<string, unknown>> {
  const account = await env.DB.prepare(
    'SELECT id, email, display_name, picture_url, created_at, updated_at FROM accounts WHERE id = ?'
  ).bind(accountId).first<Record<string, unknown>>();
  if (!account) throw new HttpError(404, 'account_not_found', 'Account not found');
  const profile = await ensureUserProfile(env, accountId);
  return { account, profile };
}

export async function updateUserProfile(env: Env, accountId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const name = normalizeProfileName(input.name);
  const profile = await ensureUserProfile(env, accountId);
  await env.DB.prepare(
    'UPDATE user_profiles SET name = ?, updated_at = ? WHERE id = ? AND account_id = ?'
  ).bind(name, nowISO(), profile.id, accountId).run();
  return await ensureUserProfile(env, accountId);
}

function normalizeProfileName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) throw new HttpError(400, 'missing_profile_name', 'Workspace profile name is required');
  return name.slice(0, 120);
}

async function ensureUserProfile(env: Env, accountId: string): Promise<Record<string, unknown>> {
  const existing = await env.DB.prepare(
    'SELECT id, account_id, name, created_at, updated_at FROM user_profiles WHERE account_id = ? ORDER BY created_at ASC LIMIT 1'
  ).bind(accountId).first<Record<string, unknown>>();
  if (existing) return existing;
  const now = nowISO();
  const profile = {
    id: newId('profile'),
    account_id: accountId,
    name: 'Personal Workspace',
    created_at: now,
    updated_at: now
  };
  await env.DB.prepare(
    'INSERT INTO user_profiles (id, account_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(profile.id, accountId, profile.name, now, now).run();
  return profile;
}

export async function createSession(env: Env, accountId: string): Promise<{ token: string; expires_at: string }> {
  const sessionId = newId('sess');
  const token = `${sessionId}.${crypto.randomUUID().replace(/-/g, '')}`;
  const tokenHash = await sha256Hex(token);
  const now = nowISO();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  await env.DB.prepare(
    'INSERT INTO account_sessions (id, account_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(sessionId, accountId, tokenHash, now, expiresAt).run();
  return { token, expires_at: expiresAt };
}

export async function refreshSession(env: Env, session: SessionContext): Promise<{ token: string; expires_at: string }> {
  const nextSession = await createSession(env, session.accountId);
  await revokeSession(env, session.sessionId);
  return nextSession;
}

export async function revokeSession(env: Env, sessionId: string): Promise<void> {
  await env.DB.prepare('UPDATE account_sessions SET revoked_at = ? WHERE id = ?')
    .bind(nowISO(), sessionId)
    .run();
}

export async function requireSession(env: Env, request: Request): Promise<SessionContext> {
  const authorization = request.headers.get('Authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new HttpError(401, 'missing_session', 'Authorization bearer token is required');

  const tokenHash = await sha256Hex(match[1]);
  const session = await env.DB.prepare(
    'SELECT id, account_id, expires_at, revoked_at FROM account_sessions WHERE token_hash = ?'
  ).bind(tokenHash).first<{ id: string; account_id: string; expires_at: string; revoked_at: string | null }>();
  if (!session || session.revoked_at) throw new HttpError(401, 'invalid_session', 'Session is invalid');
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    throw new HttpError(401, 'session_expired', 'Session expired');
  }

  return { accountId: session.account_id, sessionId: session.id };
}
