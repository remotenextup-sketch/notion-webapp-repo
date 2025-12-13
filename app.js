console.log('🔥 APP.JS PROXY BUILD 2025-12-12 FINAL');

// =====================================================
// 🔒 fetch ガード（Toggl直叩き防止）
// =====================================================
(() => {
  const originalFetch = window.fetch;
  window.fetch = function (input, init = {}) {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof Request
        ? input.url
        : '';

    if (url.includes('api.track.toggl.com')) {
      console.error('🚨 Direct Toggl API call blocked:', url);
      throw new Error('Direct Toggl API call blocked. Use proxy.');
    }

    if (url.includes('/api/proxy')) {
      console.log('🟢 Proxy fetch:', init?.method || 'POST', url);
    }

    return originalFetch(input, init);
  };
})();

// =====================================================
// 定数・設定
// =====================================================
const PROXY_URL = 'https://company-notion-toggl-api.vercel.app/api/proxy';
const TOGGL_V9_BASE_URL = 'https://api.track.toggl.com/api/v9';

const settings = {
  notionToken: '',
  notionDatabases: [],
  humanUserId: '',
  togglApiToken: '',
  togglWorkspaceId: '',
  databases: [],
  currentRunningTask: null,
  startTime: null,
  timerInterval: null
};

// =====================================================
// 汎用ユーティリティ
// =====================================================
function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function showNotification(msg, ms = 3000) {
  alert(msg);
}

// =====================================================
// 🧠 Proxy 経由 API（ここが最重要）
// =====================================================
async function externalApi(targetUrl, method, auth, body = null) {
  const payload = {
    targetUrl,
    method,
    tokenKey: auth.tokenKey,
    tokenValue: auth.tokenValue,
    notionVersion: auth.notionVersion,
    body
  };

  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Proxy Error' }));
    throw new Error(`API Error (${res.status}): ${err.message}`);
  }

  return res.status === 204 ? null : res.json();
}

// =====================================================
// Notion API
// =====================================================
async function notionApi(endpoint, method = 'GET', body = null) {
  return externalApi(
    `https://api.notion.com/v1${endpoint}`,
    method,
    {
      tokenKey: 'notionToken',
      tokenValue: settings.notionToken,
      notionVersion: '2022-06-28'
    },
    body
  );
}

// =====================================================
// Toggl API（必ず method を渡す）
// =====================================================
async function externalTogglApi(targetUrl, method = 'GET', body = null) {
  return externalApi(
    targetUrl,
    method,
    {
      tokenKey: 'togglApiToken',
      tokenValue: settings.togglApiToken,
      notionVersion: '2022-06-28'
    },
    body
  );
}

// =====================================================
// KPI レポート（405対策済）
// =====================================================
async function fetchKpiReport() {
  if (!settings.togglApiToken || !settings.togglWorkspaceId) {
    alert('Toggl設定が未入力です');
    return;
  }

  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 7);

  const url = `${TOGGL_V9_BASE_URL}/workspaces/${settings.togglWorkspaceId}/time_entries/search`;

  const body = {
    start_date: start.toISOString(),
    end_date: end.toISOString()
  };

  const entries = await externalTogglApi(url, 'POST', body);

  let total = 0;
  const byTag = {};

  entries.forEach(e => {
    if (e.duration > 0) {
      const ms = e.duration * 1000;
      total += ms;
      (e.tags || ['(no tag)']).forEach(t => {
        byTag[t] = (byTag[t] || 0) + ms;
      });
    }
  });

  console.log('📊 KPI RESULT', byTag);
  showNotification(`KPI取得完了：${formatTime(total)}`);
}

// =====================================================
// 初期化
// =====================================================
function loadSettings() {
  settings.notionToken = localStorage.getItem('notionToken') || '';
  settings.togglApiToken = localStorage.getItem('togglApiToken') || '';
  settings.togglWorkspaceId = localStorage.getItem('togglWorkspaceId') || '';
}

function init() {
  loadSettings();
  document
    .getElementById('fetchKpiButton')
    ?.addEventListener('click', fetchKpiReport);
}

init();
