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
const PROXY_URL = '/api/proxy';
const TOGGL_V9_BASE_URL = 'https://api.track.toggl.com/api/v9';

// =====================================================
// 状態
// =====================================================
const settings = {
  notionToken: '',
  humanUserId: '',
  togglApiToken: '',
  togglWorkspaceId: '',
  notionDatabases: [],
  currentTask: null,
  currentEntryId: null,
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
    addDbConfigButton: document.getElementById('addDbConfig'),

    taskDbFilter: document.getElementById('taskDbFilter'),
    reloadTasksButton: document.getElementById('reloadTasks'),
    taskListContainer: document.getElementById('taskListContainer'),

    startExistingTask: document.getElementById('startExistingTask'),
    startNewTask: document.getElementById('startNewTask'),
    existingTaskTab: document.getElementById('existingTaskTab'),
    newTaskTab: document.getElementById('newTaskTab'),

    runningTaskContainer: document.getElementById('runningTaskContainer'),
    runningTaskTitle: document.getElementById('runningTaskTitle'),
    runningTimer: document.getElementById('runningTimer'),
    thinkingLogInput: document.getElementById('thinkingLogInput'),

    stopTaskButton: document.getElementById('stopTaskButton'),
    completeTaskButton: document.getElementById('completeTaskButton'),

    startNewTaskButton: document.getElementById('startNewTaskButton'),
    newTaskTitle: document.getElementById('newTaskTitle'),
  };
}

// =====================================================
// LocalStorage
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
      body,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Proxy Error ${res.status}: ${t}`);
  }
  return res.status === 204 ? null : res.json();
}

function notionApi(endpoint, method = 'GET', body = null) {
  return externalApi(
    `https://api.notion.com/v1${endpoint}`,
    method,
    {
      tokenKey: 'notionToken',
      tokenValue: settings.notionToken,
      notionVersion: '2022-06-28',
    },
    body
  );
}

function togglApi(url, method = 'GET', body = null) {
  return externalApi(
    url,
    method,
    {
      tokenKey: 'togglApiToken',
      tokenValue: settings.togglApiToken,
    },
    body
  );
}

// =====================================================
// Toggl
// =====================================================
async function startToggl(title) {
  const url = `${TOGGL_V9_BASE_URL}/time_entries`;
  const body = {
    workspace_id: Number(settings.togglWorkspaceId),
    description: title,
    start: new Date().toISOString(),
    duration: -1,
    created_with: 'Notion Toggl Timer',
  };
  const res = await togglApi(url, 'POST', body);
  settings.currentEntryId = res.id;
}

async function stopToggl() {
  const wid = settings.togglWorkspaceId;
  const url = `${TOGGL_V9_BASE_URL}/workspaces/${wid}/time_entries/${settings.currentEntryId}/stop`;
  await togglApi(url, 'PATCH');
  settings.currentEntryId = null;
}

// =====================================================
// タスク処理
// =====================================================
async function handleStartTask(title) {
  settings.currentTask = title;
  dom.runningTaskTitle.textContent = title;
  dom.runningTaskContainer.classList.remove('hidden');
  await startToggl(title);
}

async function handleStopTask(isComplete) {
  await stopToggl();
  dom.runningTaskContainer.classList.add('hidden');
  settings.currentTask = null;
  alert(isComplete ? 'タスク完了！' : '停止しました');
}

// =====================================================
// 設定画面
// =====================================================
function renderDbConfigForms() {
  dom.dbConfigContainer.innerHTML = '';
  if (settings.notionDatabases.length === 0) {
    settings.notionDatabases.push({ name: '', id: '' });
  }
  settings.notionDatabases.forEach((db, i) => {
    const row = document.createElement('div');
    row.innerHTML = `
      <input class="input-field db-name" data-i="${i}" placeholder="DB名" value="${db.name}">
      <input class="input-field db-id" data-i="${i}" placeholder="Database ID" value="${db.id}">
    `;
    dom.dbConfigContainer.appendChild(row);
  });
}

// =====================================================
// Init
// =====================================================
function init() {
  dom = getDomElements();
  loadSettings();

  console.log('✅ init 完了', dom);

  dom.toggleSettingsButton.onclick = () => {
    dom.settingsView.classList.remove('hidden');
    dom.mainView.classList.add('hidden');
    renderDbConfigForms();
  };

  dom.cancelConfigButton.onclick = () => {
    dom.settingsView.classList.add('hidden');
    dom.mainView.classList.remove('hidden');
  };

  dom.saveConfigButton.onclick = () => {
    settings.notionToken = dom.confNotionToken.value.trim();
    settings.humanUserId = dom.confNotionUserId.value.trim();
    settings.togglApiToken = dom.confTogglToken.value.trim();
    settings.togglWorkspaceId = dom.confTogglWid.value.trim();

    const names = document.querySelectorAll('.db-name');
    const ids = document.querySelectorAll('.db-id');
    settings.notionDatabases = [];
    names.forEach((n, i) => {
      if (n.value && ids[i].value) {
        settings.notionDatabases.push({ name: n.value, id: ids[i].value });
      }
    });

    saveSettings();
    alert('設定保存完了');
    dom.settingsView.classList.add('hidden');
    dom.mainView.classList.remove('hidden');
  };

  dom.addDbConfigButton.onclick = () => {
    settings.notionDatabases.push({ name: '', id: '' });
    renderDbConfigForms();
  };

  dom.stopTaskButton.onclick = () => handleStopTask(false);
  dom.completeTaskButton.onclick = () => handleStopTask(true);

  dom.startNewTaskButton.onclick = () => {
    const title = dom.newTaskTitle.value.trim();
    if (!title) return alert('タスク名を入力してください');
    handleStartTask(title);
  };
}

init();
