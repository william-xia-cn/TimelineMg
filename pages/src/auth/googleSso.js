export const GOOGLE_SSO_CLIENT_ID = import.meta.env.VITE_GOOGLE_OIDC_CLIENT_ID || '';

const SCRIPT_ID = 'timewhere-google-identity-services';
const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

export function isGoogleSsoConfigured(clientId = GOOGLE_SSO_CLIENT_ID) {
  return Boolean(clientId && typeof clientId === 'string' && clientId.trim());
}

export function loadGoogleIdentityScript(documentRef = document) {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);

  const existing = documentRef.getElementById(SCRIPT_ID);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(window.google.accounts.id), { once: true });
      existing.addEventListener('error', () => reject(new Error('google_identity_script_failed')), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = documentRef.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.id) resolve(window.google.accounts.id);
      else reject(new Error('google_identity_unavailable'));
    };
    script.onerror = () => reject(new Error('google_identity_script_failed'));
    documentRef.head.appendChild(script);
  });
}

export async function renderGoogleSsoButton({ buttonElement, clientId = GOOGLE_SSO_CLIENT_ID, onCredential, onError }) {
  if (!buttonElement || !isGoogleSsoConfigured(clientId)) return { status: 'not_configured' };
  const googleIdentity = await loadGoogleIdentityScript();
  buttonElement.innerHTML = '';
  googleIdentity.initialize({
    client_id: clientId,
    callback: response => {
      if (response?.credential) onCredential(response.credential);
      else onError?.(new Error('missing_google_credential'));
    }
  });
  googleIdentity.renderButton(buttonElement, {
    theme: 'outline',
    size: 'large',
    type: 'standard',
    text: 'signin_with',
    width: 280
  });
  return { status: 'ready' };
}

export function disableGoogleAutoSelect() {
  window.google?.accounts?.id?.disableAutoSelect?.();
}
