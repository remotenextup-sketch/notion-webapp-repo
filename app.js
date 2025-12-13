console.log('🔥 APP.JS PROXY BUILD 2025-12-12 FINAL');

// =====================================================
// 🔒 SAFETY PATCH
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
      throw new Error('Direct Toggl API call blocked. Use proxy.');
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
  togglWorkspaceId: ''
};

let dom = null;

// =====================================================
// Utility
// =====================================================
function showNotification(msg, ms = 3000) {
  alert(msg);
}

// =====================================================
// DOM取得
// =====================================================
function getDomElements() {
  return {
    mainView: document.getElementById('mainView'),
    settingsView: document.getElementById('settingsView'),

    confNotionToken: document.getElementById('confNotionToken'),
    confNotionUserId: document.getElementById('confNotionUserId'),
    confTogglToken: document.getElementById('confTogglToken'),
    confTogglWid: document.getElementById('confTogglWid'),

    dbConfigContainer: document.getElementById('dbConfigContainer'),
    addDbConfigButton: document.getElementById('addDbConfig'),

    saveConfigButton: document.getElementById('saveConfig'),
    toggleSettingsButton: document.getElementById('toggleSettings'),
    cancelConfigButton: document.getElementById('cancelConfig'),

    fetchKpiButton: document.getElementById('fetchKpiButton')
  };
}

// =====================================================
// Settings
// =====================================================
function loadSettings() {
  settings.notionToken = localStorage.getItem('notionToken') || '';
  settings.humanUserId = localStorage.getItem('humanUserId') || '';
  settings.togglApiToken = localStorage.getItem('togglApiToken') || '';
  settings.togglWorkspaceId = localStorage.getItem('togglWorkspaceId') || '';
  settings.notionDatabases = JSON.parse(localStorage.getItem('notionDatabases') || '[]');
}

function saveSettings() {
  localStorage.setItem('notionToken', settings.notionToken);
  localStorage.setItem('humanUserId', settings.humanUserId);
  localStorage.setItem('togglApiToken', settings.togglApiToken);
  localStorage.setItem('togglWorkspaceId', settings.togglWorkspaceId);
  localStorage.setItem('notionDatabases', JSON.stringify(settings.notionDatabases));
}

// =====================================================
// 🔧 DB設定フォーム（← 今回の肝）
// =====================================================
function renderDbConfigForms() {
  if (!dom.dbConfigContainer) return;
  dom.dbConfigContainer.innerHTML = '';

  if (settings.notionDatabases.length === 0) {
    settings.notionDatabases.push({ name: '', id: '' });
  }

  settings.notionDatabases.forEach((db, i) => {
    const row = document.createElement('div');
    row.style.marginBottom = '8px';
    row.innerHTML = `
      <input class="db-name" data-i="${i}" placeholder="DB名" value="${db.name || ''}">
      <input class="db-id" data-i="${i}" placeholder="DB ID" value="${db.id || ''}">
    `;
    dom.dbConfigContainer.appendChild(row);
  });
}

// =====================================================
// 保存処理
// =====================================================
function handleSaveSettings() {
  settings.notionToken = dom.confNotionToken.value.trim();
  settings.humanUserId = dom.confNotionUserId.value.trim();
  settings.togglApiToken = dom.confTogglToken.value.trim();
  settings.togglWorkspaceId = dom.confTogglWid.value.trim();

  const names = document.querySelectorAll('.db-name');
  const ids = document.querySelectorAll('.db-id');

  settings.notionDatabases = [];
  names.forEach((n, i) => {
    const name = n.value.trim();
    const id = ids[i].value.trim();
    if (name && id) settings.notionDatabases.push({ name, id });
  });

  saveSettings();
  showNotification('設定を保存しました');

  dom.settingsView.classList.add('hidden');
  dom.mainView.classList.remove('hidden');
}

// =====================================================
// KPI
// =====================================================
async function externalApi(targetUrl, method, auth, body = null) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetUrl,
      method,
      tokenKey: auth.tokenKey,
      tokenValue: auth.tokenValue,
      notionVersion: auth.notionVersion,
      body
    })
  });
  if (!res.ok) throw new Error('Proxy error');
  return res.json();
}

function externalTogglApi(url, method, body) {
  return externalApi(url, method, {
    tokenKey: 'togglApiToken',
    tokenValue: settings.togglApiToken,
    notionVersion: '2022-06-28'
  }, body);
}

async function fetchKpiReport() {
  const url = `${TOGGL_V9_BASE_URL}/workspaces/${settings.togglWorkspaceId}/time_entries/search`;
  await externalTogglApi(url, 'POST', {
    start_date: new Date(Date.now() - 7 * 86400000).toISOString(),
    end_date: new Date().toISOString()
  });
  showNotification('KPI取得完了');
}

// =====================================================
// Init
// =====================================================
function init() {
  dom = getDomElements();
  loadSettings();

  dom.toggleSettingsButton?.addEventListener('click', () => {
    renderDbConfigForms();           // ← ★これが無かった
    dom.settingsView.classList.remove('hidden');
    dom.mainView.classList.add('hidden');
  });

  dom.cancelConfigButton?.addEventListener('click', () => {
    dom.settingsView.classList.add('hidden');
    dom.mainView.classList.remove('hidden');
  });

  dom.saveConfigButton?.addEventListener('click', handleSaveSettings);
  dom.addDbConfigButton?.addEventListener('click', () => {
    settings.notionDatabases.push({ name: '', id: '' });
    renderDbConfigForms();
  });

  dom.fetchKpiButton?.addEventListener('click', fetchKpiReport);
}

init();
