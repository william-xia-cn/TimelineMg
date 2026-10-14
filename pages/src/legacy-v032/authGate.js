import { apiClient } from '../api/client.js';
import { GOOGLE_SSO_CLIENT_ID, renderGoogleSsoButton } from '../auth/googleSso.js';

export const SESSION_KEY = 'timewhere.web.session';
export const DEMO_MODE_KEY = 'timewhere.web.demo_mode.v1';

function readSession(storage = window.localStorage) {
  try {
    return JSON.parse(storage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

export function hasTimeWhereSession(storage = window.localStorage) {
  return Boolean(readSession(storage)?.token);
}

export function isDemoMode(storage = window.localStorage) {
  return storage.getItem(DEMO_MODE_KEY) === 'true';
}

export function setDemoMode(enabled, storage = window.localStorage) {
  if (enabled) storage.setItem(DEMO_MODE_KEY, 'true');
  else storage.removeItem(DEMO_MODE_KEY);
}

export function shouldShowAuthGate(storage = window.localStorage) {
  return !hasTimeWhereSession(storage) && !isDemoMode(storage);
}

function installAuthGateStyles() {
  if (document.getElementById('timewhere-auth-gate-style')) return;
  const style = document.createElement('style');
  style.id = 'timewhere-auth-gate-style';
  style.textContent = `
    html.timewhere-auth-gated,
    html.timewhere-auth-gated body {
      width: 100%;
      min-height: 100%;
      margin: 0;
      overflow: hidden;
      background: #f1f5f9;
      font-family: Inter, "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    }
    .timewhere-auth-gate {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 32px;
      background:
        linear-gradient(135deg, rgba(255,255,255,.88), rgba(224,242,254,.76)),
        url("/legacy-v032/images/bg.jpg") center / cover no-repeat;
      color: #172033;
    }
    .timewhere-auth-card {
      width: min(760px, calc(100vw - 48px));
      border: 1px solid rgba(148, 163, 184, .32);
      border-radius: 28px;
      background: rgba(255, 255, 255, .92);
      box-shadow: 0 24px 80px rgba(15, 23, 42, .18);
      padding: 40px;
      backdrop-filter: blur(18px);
    }
    .timewhere-auth-eyebrow {
      margin: 0 0 12px;
      font-size: 14px;
      font-weight: 800;
      letter-spacing: .08em;
      color: #1d8cf8;
      text-transform: uppercase;
    }
    .timewhere-auth-title {
      margin: 0;
      font-size: 34px;
      line-height: 1.16;
      letter-spacing: 0;
      color: #172033;
    }
    .timewhere-auth-copy {
      margin: 18px 0 0;
      max-width: 560px;
      color: #52627a;
      font-size: 17px;
      line-height: 1.7;
    }
    .timewhere-auth-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 14px;
      margin-top: 28px;
    }
    .timewhere-auth-google {
      min-width: 280px;
      min-height: 44px;
      display: grid;
      align-items: center;
    }
    .timewhere-auth-demo {
      border: 1px solid rgba(29, 140, 248, .24);
      border-radius: 14px;
      background: #fff;
      color: #1d8cf8;
      cursor: pointer;
      font: inherit;
      font-weight: 800;
      padding: 12px 18px;
      box-shadow: 0 8px 18px rgba(15, 23, 42, .08);
    }
    .timewhere-auth-demo:hover {
      background: #eff6ff;
    }
    .timewhere-auth-status {
      margin-top: 18px;
      min-height: 24px;
      color: #52627a;
      font-size: 14px;
    }
    .timewhere-auth-status[data-tone="error"] {
      color: #b91c1c;
    }
    .timewhere-auth-note {
      margin-top: 22px;
      border-top: 1px solid rgba(148, 163, 184, .22);
      padding-top: 18px;
      color: #64748b;
      font-size: 14px;
      line-height: 1.6;
    }
  `;
  document.head.appendChild(style);
}

export async function renderLegacyAuthGate({
  onAuthenticated = () => window.location.reload(),
  onDemo = () => window.location.reload()
} = {}) {
  installAuthGateStyles();
  document.documentElement.classList.add('timewhere-auth-gated');
  document.body.innerHTML = `
    <main class="timewhere-auth-gate" aria-label="TimeWhere 登录">
      <section class="timewhere-auth-card">
        <p class="timewhere-auth-eyebrow">TimeWhere Cloud</p>
        <h1 class="timewhere-auth-title">先登录，再进入你的时间工作台</h1>
        <p class="timewhere-auth-copy">
          WebDev 版本以 TimeWhere Cloud 作为数据源。新用户需要先使用 Google 登录创建 Cloud session；
          演示模式只用于查看界面，不会写入真实工作区。
        </p>
        <div class="timewhere-auth-actions">
          <div class="timewhere-auth-google" id="timewhereAuthGoogle"></div>
          <button class="timewhere-auth-demo" type="button" id="timewhereAuthDemo">查看演示界面</button>
        </div>
        <div class="timewhere-auth-status" id="timewhereAuthStatus" role="status"></div>
        <p class="timewhere-auth-note">
          Google 在这里仅用于单点登录。任务、日历和设置保存在 TimeWhere Cloud，不使用 Google Drive 作为 WebDev 数据源。
        </p>
      </section>
    </main>
  `;

  const status = document.getElementById('timewhereAuthStatus');
  const googleButton = document.getElementById('timewhereAuthGoogle');
  const demoButton = document.getElementById('timewhereAuthDemo');

  document.documentElement.dataset.timewhereWebReady = 'true';
  document.documentElement.dataset.timewhereAuthGate = 'true';
  window.dispatchEvent(new CustomEvent('timewhere-web-ready', {
    detail: { page: 'auth', baseline: 'v0.3.2', gated: true }
  }));

  demoButton?.addEventListener('click', () => {
    setDemoMode(true);
    status.textContent = '正在进入演示界面...';
    onDemo();
  });

  if (!GOOGLE_SSO_CLIENT_ID) {
    status.dataset.tone = 'error';
    status.textContent = 'Google SSO 尚未配置，暂时只能进入演示界面。';
    return;
  }

  status.textContent = '正在准备 Google 登录...';
  try {
    const result = await renderGoogleSsoButton({
      buttonElement: googleButton,
      onCredential: async idToken => {
        status.dataset.tone = '';
        status.textContent = '正在创建 TimeWhere Cloud session...';
        try {
          await apiClient.loginWithGoogleIdToken(idToken);
          setDemoMode(false);
          status.textContent = '登录成功，正在进入 TimeWhere...';
          onAuthenticated();
        } catch (error) {
          status.dataset.tone = 'error';
          status.textContent = `登录失败：${error.message || '无法创建 Cloud session'}`;
        }
      },
      onError: error => {
        status.dataset.tone = 'error';
        status.textContent = `Google 登录失败：${error.message || 'unknown_error'}`;
      }
    });
    if (result.status === 'ready') {
      status.textContent = '请选择 Google 账户登录。';
    }
  } catch (error) {
    status.dataset.tone = 'error';
    status.textContent = `Google 登录组件加载失败：${error.message || 'unknown_error'}`;
  }
}
