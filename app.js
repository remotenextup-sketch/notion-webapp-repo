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
  togglWorkspaceId: '',
  databases: []
};

let dom = null;

// =====================================================
// Utility
// =====================================================
function showNotification(msg) {
  alert(msg);
}

function clearElement(el) {
  if (el) el.innerHTML = '';
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

    taskDbFilter: document.getElementById('taskDbFilter'),
    taskListContainer: document.getElementById('taskListContainer'),

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
  try {
    settings.notionDatabases = JSON.parse(localStorage.getItem('notionDatabases') || '[]');
  } catch {
    settings.notionDatabases = [];
  }
}

function saveSettings() {
  localStorage.setItem('notionToken', settings.notionToken);
  localStorage.setItem('humanUserId', settings.humanUserId);
  localStorage.setItem('togglApiToken', settings.togglApiToken);
  localStorage.setItem('togglWorkspaceId', settings.togglWorkspaceId);
  localStorage.setItem('notionDatabases', JSON.stringify(settings.notionDatabases));
}

// =====================================================
// 🔧 DB設定フォーム
// =====================================================
function renderDbConfigForms() {
  if (!dom.dbConfigContainer) return;
  clearElement(dom.dbConfigContainer);

  if (settings.notionDatabases.length === 0) {
    settings.notionDatabases.push({ name: '', id: '' });
  }

  settings.notionDatabases.forEach((db) => {
    const row = document.createElement('div');
    row.style.marginBottom = '6px';
    row.innerHTML = `
      <input class="db-name" placeholder="DB名" value="${db.name}">
      <input class="db-id" placeholder="DB ID" value="${db.id}">
    `;
    dom.dbConfigContainer.appendChild(row);
  });
}

// =====================================================
// Proxy API
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

  if (!res.ok) {
    const e = await res.json().catch(() => ({ message: 'Proxy Error' }));
    throw new Error(e.message);
  }
  return res.status === 204 ? null : res.json();
}

// =====================================================
// Notion API
// =====================================================
function notionApi(endpoint, method = 'GET', body = null) {
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
// Notion DB取得 & タスク表示
// =====================================================
async function fetchDatabaseList() {
  settings.databases = [];
  for (const db of settings.notionDatabases) {
    try {
      const res = await notionApi(`/databases/${db.id.replace(/-/g, '')}`);
      settings.databases.push({ id: res.id, name: db.name });
    } catch (e) {
      console.warn('DB取得失敗', db.name);
    }
  }

  renderDbFilter();
}

function renderDbFilter() {
  if (!dom.taskDbFilter) return;
  clearElement(dom.taskDbFilter);

  settings.databases.forEach(db => {
    const opt = document.createElement('option');
    opt.value = db.id;
    opt.textContent = db.name;
    dom.taskDbFilter.appendChild(opt);
  });

  dom.taskDbFilter.addEventListener('change', loadTasks);
}

async function loadTasks() {
  const dbId = dom.taskDbFilter?.value;
  if (!dbId || !dom.taskListContainer) return;

  clearElement(dom.taskListContainer);
  dom.taskListContainer.textContent = '読み込み中...';

  const res = await notionApi(`/databases/${dbId}/query`, 'POST', {});
  clearElement(dom.taskListContainer);

  res.results.forEach(page => {
    const title =
      page.properties.Name?.title?.[0]?.plain_text || '無題';

    const div = document.createElement('div');
    div.textContent = title;
    dom.taskListContainer.appendChild(div);
  });
}

// =====================================================
// KPI（Toggl）
// =====================================================
async function fetchKpiReport() {
  if (!settings.togglApiToken || !settings.togglWorkspaceId) {
    alert('Toggl設定が未入力です');
    return;
  }

  const url = `${TOGGL_V9_BASE_URL}/workspaces/${settings.togglWorkspaceId}/time_entries/search`;
  await externalApi(
    url,
    'POST',
    {
      tokenKey: 'togglApiToken',
      tokenValue: settings.togglApiToken,
      notionVersion: '2022-06-28'
    },
    {
      start_date: new Date(Date.now() - 7 * 86400000).toISOString(),
      end_date: new Date().toISOString()
    }
  );

  showNotification('KPI取得完了');
}

// =====================================================
// 保存処理
// =====================================================
async function handleSaveSettings() {
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
  dom.settingsView.classList.add('hidden');
  dom.mainView.classList.remove('hidden');

  await fetchDatabaseList();
  await loadTasks();

  showNotification('設定を保存しました');
}

// =====================================================
// Init
// =====================================================
function init() {
  dom = getDomElements();
  loadSettings();

  dom.toggleSettingsButton?.addEventListener('click', () => {
    renderDbConfigForms();
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

  if (settings.notionToken && settings.notionDatabases.length > 0) {
    fetchDatabaseList().then(loadTasks);
  }
}

init();
