const SESSION_KEY = 'timewhere.web.session';

export class ApiError extends Error {
  constructor(status, code, message, retryable = false) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export function createApiClient({ baseUrl = '', storage = window.localStorage } = {}) {
  function getSession() {
    try {
      return JSON.parse(storage.getItem(SESSION_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function setSession(session) {
    if (!session) {
      storage.removeItem(SESSION_KEY);
      return;
    }
    storage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  async function request(path, options = {}) {
    const session = getSession();
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    if (session?.token) headers.Authorization = `Bearer ${session.token}`;

    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
      body: options.body && typeof options.body !== 'string'
        ? JSON.stringify(options.body)
        : options.body
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.status === 'error') {
      const error = payload?.error || {};
      throw new ApiError(response.status, error.code || 'request_failed', error.message || 'Request failed', error.retryable);
    }
    return payload?.data;
  }

  return {
    getSession,
    setSession,
    request,
    async health() {
      return request('/health', { method: 'GET' });
    },
    async loginWithGoogleIdToken(idToken) {
      const data = await request('/auth/google', { method: 'POST', body: { id_token: idToken } });
      setSession({ ...data.session, account: data.account });
      return data;
    },
    async getAccount() {
      return request('/account/me', { method: 'GET' });
    },
    async getSyncStatus() {
      return request('/sync/status', { method: 'GET' });
    },
    async listSyncMutationOutcomes({ status = 'rejected', limit = 20 } = {}) {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (limit) params.set('limit', String(limit));
      const query = params.toString();
      return request(`/sync/mutations${query ? `?${query}` : ''}`, { method: 'GET' });
    },
    async getSyncMutationOutcome(mutationId) {
      return request(`/sync/mutations/${encodeURIComponent(mutationId)}`, { method: 'GET' });
    },
    async getSyncReplayReadinessSummary(body) {
      return request('/sync/mutations/readiness-summary', { method: 'POST', body });
    },
    async listSyncConflicts({ status = 'open', limit = 20 } = {}) {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (limit) params.set('limit', String(limit));
      const query = params.toString();
      return request(`/sync/conflicts${query ? `?${query}` : ''}`, { method: 'GET' });
    },
    async getSyncConflict(conflictId) {
      return request(`/sync/conflicts/${encodeURIComponent(conflictId)}`, { method: 'GET' });
    },
    async logout() {
      try {
        if (getSession()?.token) await request('/auth/session', { method: 'DELETE' });
      } finally {
        setSession(null);
      }
    },
    logoutLocal() {
      setSession(null);
    }
  };
}

export const apiClient = createApiClient();
