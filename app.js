// =====================================================
// 🔒 SAFETY PATCH（Toggl直叩き防止：proxy必須）
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

    if (url.includes('api.track.toggl.com') && !url.includes('/api/proxy')) {
      throw new Error('Direct Toggl API call blocked. Use proxy.');
    }
    return originalFetch(input, init);
  };
})();

// =====================================================
// 定数
// =====================================================
const PROXY_URL = 'https://company-notion-toggl-api.vercel.app/api/proxy';
const TOGGL_V9_BASE = 'https://api.track.toggl.com/api/v9';

// =====================================================
// 状態
// =====================================================
const settings = {
  notionToken: '',
  togglApiToken: '',
  togglWorkspaceId: '',
  notionDatabases: [],
  currentRunning: null // { title, entryId }
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
    confTogglToken: document.getElementById('confTogglToken'),
    confTogglWid: document.getElementById('confTogglWid'),

    dbConfigContainer: document.getElementById('dbConfigContainer'),
    addDbConfigButton: document.getElementById('addDbConfig'),

    taskDbFilter: document.getElementById('taskDbFilter'),
    taskListContainer: document.getElementById('taskListContainer'),

    startExistingTask: document.getElementById('startExistingTask'),
    startNewTask: document.getElementById('startNewTask'),
    existingTaskTab: document.getElementById('existingTaskTab'),
    newTaskTab: document.getElementById('newTaskTab'),

    newTaskTitle: document.getElementById('newTaskTitle'),
    startNewTaskButton: document.getElementById('startNewTaskButton')
  };
}

// =====================================================
// 通知
// =====================================================
function notify(msg) {
  alert(msg);
}

// =====================================================
// LocalStorage
// =====================================================
function loadSettings() {
  settings.notionToken = localStorage.getItem('notionToken') || '';
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
  localStorage.setItem('togglApiToken', settings.togglApiToken);
  localStorage.setItem('togglWorkspaceId', settings.togglWorkspaceId);
  localStorage.setItem('notionDatabases', JSON.stringify(settings.notionDatabases));
}

// =====================================================
// Proxy API
// =====================================================
async function externalApi(targetUrl, method, token, body = null) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetUrl,
      method,
      tokenKey: 'togglApiToken',
      tokenValue: token,
      body
    })
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(t);
  }
  return res.json();
}

// =====================================================
// Toggl API
// =====================================================
async function startToggl(title) {
  const url = `${TOGGL_V9_BASE}/time_entries`;
  const body = {
    description: title,
    workspace_id: Number(settings.togglWorkspaceId),
    start: new Date().toISOString(),
    duration: -1,
    created_with: 'Notion Timer'
  };
  return externalApi(url, 'POST', settings.togglApiToken, body);
}

async function stopToggl(entryId) {
  const url = `${TOGGL_V9_BASE}/workspaces/${settings.togglWorkspaceId}/time_entries/${entryId}/stop`;
  return externalApi(url, 'PATCH', settings.togglApiToken);
}

// =====================================================
// Notion タスク取得（読むだけ）
// =====================================================
async function loadTasks() {
  dom.taskListContainer.innerHTML = '読み込み中…';

  const db = settings.notionDatabases[0];
  if (!db) {
    dom.taskListContainer.innerHTML = 'DB未設定';
    return;
  }

  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetUrl: `https://api.notion.com/v1/databases/${db.id}/query`,
      method: 'POST',
      tokenKey: 'notionToken',
      tokenValue: settings.notionToken,
      notionVersion: '2022-06-28'
    })
  }).then(r => r.json());

  const ul = document.createElement('ul');
  ul.className = 'task-list';

  res.results.forEach(page => {
    const titleProp = Object.values(page.properties).find(p => p.type === 'title');
    const title = titleProp?.title?.[0]?.plain_text || '無題';

    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = title;

    const btn = document.createElement('button');
    btn.textContent = '▶ 開始';
    btn.className = 'btn btn-green';

    btn.onclick = async () => {
      if (settings.currentRunning) {
        notify('すでに打刻中です');
        return;
      }
      const entry = await startToggl(title);
      settings.currentRunning = { title, entryId: entry.id };
      notify(`打刻開始: ${title}`);
    };

    li.appendChild(span);
    li.appendChild(btn);
    ul.appendChild(li);
  });

  dom.taskListContainer.innerHTML = '';
  dom.taskListContainer.appendChild(ul);
}

// =====================================================
// 新規タスク打刻（Notion作成なし）
// =====================================================
function setupNewTask() {
  dom.startNewTaskButton.onclick = async () => {
    const title = dom.newTaskTitle.value.trim();
    if (!title) {
      notify('タスク名を入力してください');
      return;
    }
    if (settings.currentRunning) {
      notify('すでに打刻中です');
      return;
    }
    const entry = await startToggl(title);
    settings.currentRunning = { title, entryId: entry.id };
    notify(`新規タスク打刻開始: ${title}`);
  };
}

// =====================================================
// タブ切替
// =====================================================
function switchTab(e) {
  const t = e.currentTarget.dataset.target;
  dom.startExistingTask.classList.remove('active');
  dom.startNewTask.classList.remove('active');
  e.currentTarget.classList.add('active');

  if (t === 'existing') {
    dom.existingTaskTab.classList.remove('hidden');
    dom.newTaskTab.classList.add('hidden');
  } else {
    dom.existingTaskTab.classList.add('hidden');
    dom.newTaskTab.classList.remove('hidden');
  }
}

// =====================================================
// Init
// =====================================================
async function init() {
  dom = getDomElements();
  loadSettings();

  dom.toggleSettingsButton.onclick = () => {
    dom.settingsView.classList.remove('hidden');
    dom.mainView.classList.add('hidden');
  };
  dom.cancelConfigButton.onclick = () => {
    dom.settingsView.classList.add('hidden');
    dom.mainView.classList.remove('hidden');
  };
  dom.saveConfigButton.onclick = () => {
    settings.notionToken = dom.confNotionToken.value.trim();
    settings.togglApiToken = dom.confTogglToken.value.trim();
    settings.togglWorkspaceId = dom.confTogglWid.value.trim();
    saveSettings();
    notify('設定保存');
    dom.settingsView.classList.add('hidden');
    dom.mainView.classList.remove('hidden');
    loadTasks();
  };

  dom.startExistingTask.onclick = switchTab;
  dom.startNewTask.onclick = switchTab;

  setupNewTask();
  await loadTasks();

  console.log('✅ init完了', dom);
}

init();
