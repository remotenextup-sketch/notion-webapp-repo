// =====================================================
// 🔒 SAFETY PATCH（Toggl直叩き防止）
// =====================================================
(() => {
  if (typeof window.fetch !== 'function') return;

  const originalFetch = window.fetch.bind(window);

  window.fetch = function (input, init = {}) {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof Request
        ? input.url
        : '';

    if (url && url.includes('api.track.toggl.com') && !url.includes('/api/proxy')) {
      console.error('🚨 BLOCKED: Direct Toggl API call', url);
      throw new Error('Direct Toggl API call blocked. Use proxy.');
    }

    return originalFetch(input, init);
  };
})();

// =====================================================
// 定数
// =====================================================
const PROXY_URL = 'https://company-notion-toggl-api.vercel.app/api/proxy';

// =====================================================
// 状態
// =====================================================
const settings = {
  notionToken: '',
  humanUserId: '',
  togglApiToken: '',
  togglWorkspaceId: '',
  notionDatabases: []
};

let dom = null;

// =====================================================
// DOM取得
// =====================================================
function getDomElements() {
  return {
    mainView: document.getElementById('mainView'),
    settingsView: document.getElementById('settingsView'),

    toggleSettingsButton: document.getElementById('toggleSettings'),
    cancelConfigButton: document.getElementById('cancelConfig'),
    saveConfigButton: document.getElementById('saveConfig'),

    confNotionToken: document.getElementById('confNotionToken'),
    confNotionUserId: document.getElementById('confNotionUserId'),
    confTogglToken: document.getElementById('confTogglToken'),
    confTogglWid: document.getElementById('confTogglWid'),

    dbConfigContainer: document.getElementById('dbConfigContainer'),
    addDbConfigButton: document.getElementById('addDbConfig')
  };
}

// =====================================================
// 通知
// =====================================================
function showNotification(message, duration = 2500) {
  let n = document.getElementById('appNotification');
  if (!n) {
    n = document.createElement('div');
    n.id = 'appNotification';
    n.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #4CAF50;
      color: #fff;
      padding: 10px 18px;
      border-radius: 8px;
      z-index: 9999;
      font-size: 14px;
    `;
    document.body.appendChild(n);
  }
  n.textContent = message;
  n.style.opacity = '1';
  clearTimeout(n._timer);
  n._timer = setTimeout(() => (n.style.opacity = '0'), duration);
}

// =====================================================
// LocalStorage
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
// DB設定UI
// =====================================================
function renderDbConfigForms() {
  dom.dbConfigContainer.innerHTML = '';

  if (settings.notionDatabases.length === 0) {
    settings.notionDatabases.push({ name: '', id: '' });
  }

  settings.notionDatabases.forEach((db, i) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '10px';
    row.style.marginBottom = '8px';

    row.innerHTML = `
      <input class="input-field db-name" data-i="${i}" placeholder="DB表示名" value="${db.name}">
      <input class="input-field db-id" data-i="${i}" placeholder="Notion Database ID" value="${db.id}">
    `;

    dom.dbConfigContainer.appendChild(row);
  });
}

function handleAddDbConfig() {
  settings.notionDatabases.push({ name: '', id: '' });
  renderDbConfigForms();
  showNotification('DB入力欄を追加しました');
}

// =====================================================
// 設定画面制御
// =====================================================
function showSettings() {
  dom.confNotionToken.value = settings.notionToken;
  dom.confNotionUserId.value = settings.humanUserId;
  dom.confTogglToken.value = settings.togglApiToken;
  dom.confTogglWid.value = settings.togglWorkspaceId;

  renderDbConfigForms();

  dom.settingsView.classList.remove('hidden');
  dom.mainView.classList.add('hidden');
}

function hideSettings() {
  dom.settingsView.classList.add('hidden');
  dom.mainView.classList.remove('hidden');
}

function handleSaveSettings() {
  settings.notionToken = dom.confNotionToken.value.trim();
  settings.humanUserId = dom.confNotionUserId.value.trim();
  settings.togglApiToken = dom.confTogglToken.value.trim();
  settings.togglWorkspaceId = dom.confTogglWid.value.trim();

  const names = document.querySelectorAll('.db-name');
  const ids = document.querySelectorAll('.db-id');

  const newDb = [];
  names.forEach((n, i) => {
    const name = n.value.trim();
    const id = ids[i].value.trim();
    if (name && id) newDb.push({ name, id });
  });

  settings.notionDatabases = newDb;
  saveSettings();

  showNotification('設定を保存しました');
  hideSettings();
}

// =====================================================
// Init
// =====================================================
function init() {
  dom = getDomElements();
  loadSettings();

  // ボタンイベント
  dom.toggleSettingsButton.addEventListener('click', showSettings);
  dom.cancelConfigButton.addEventListener('click', hideSettings);
  dom.saveConfigButton.addEventListener('click', handleSaveSettings);
  dom.addDbConfigButton.addEventListener('click', handleAddDbConfig);

  showNotification('アプリ起動完了');
}

init();
