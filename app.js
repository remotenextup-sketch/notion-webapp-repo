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
const TOGGL_V9_BASE = 'https://api.track.toggl.com/api/v9';

// =====================================================
// 状態
// =====================================================
const settings = {
  notionToken: '',
  humanUserId: '',
  togglApiToken: '',
  togglWorkspaceId: '',
  notionDatabases: [],
  currentRunningTask: null,
  startTime: null,
  timerInterval: null
};

let dom = null;

// =====================================================
// Utility
// =====================================================
function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function showNotification(message, duration = 2000) {
  let n = document.getElementById('appNotification');
  if (!n) {
    n = document.createElement('div');
    n.id = 'appNotification';
    n.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #333;
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
// DOM取得
// =====================================================
function getDomElements() {
  return {
    mainView: document.getElementById('mainView'),
    settingsView: document.getElementById('settingsView'),

    toggleSettings: document.getElementById('toggleSettings'),
    cancelConfig: document.getElementById('cancelConfig'),
    saveConfig: document.getElementById('saveConfig'),

    confNotionToken: document.getElementById('confNotionToken'),
    confNotionUserId: document.getElementById('confNotionUserId'),
    confTogglToken: document.getElementById('confTogglToken'),
    confTogglWid: document.getElementById('confTogglWid'),

    dbConfigContainer: document.getElementById('dbConfigContainer'),
    addDbConfig: document.getElementById('addDbConfig'),

    taskDbFilter: document.getElementById('taskDbFilter'),
    taskListContainer: document.getElementById('taskListContainer'),
    reloadTasks: document.getElementById('reloadTasks'),

    runningTaskContainer: document.getElementById('runningTaskContainer'),
    runningTaskTitle: document.getElementById('runningTaskTitle'),
    runningTimer: document.getElementById('runningTimer'),
    stopTaskButton: document.getElementById('stopTaskButton'),

    startExistingTask: document.getElementById('startExistingTask'),
    startNewTask: document.getElementById('startNewTask'),
    existingTaskTab: document.getElementById('existingTaskTab'),
    newTaskTab: document.getElementById('newTaskTab'),
    startNewTaskButton: document.getElementById('startNewTaskButton'),
    newTaskTitle: document.getElementById('newTaskTitle')
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
      body
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Proxy Error ${res.status}: ${text}`);
  }

  return res.status === 204 ? null : res.json();
}

// =====================================================
// Toggl
// =====================================================
async function startToggl(title) {
  const url = `${TOGGL_V9_BASE}/time_entries`;

  return externalApi(
    url,
    'POST',
    {
      tokenKey: 'togglApiToken',
      tokenValue: settings.togglApiToken
    },
    {
      description: title,
      created_with: 'Notion Toggl Timer',
      start: new Date().toISOString(),
      duration: -1,
      workspace_id: Number(settings.togglWorkspaceId)
    }
  );
}

async function stopToggl(entryId) {
  const wid = settings.togglWorkspaceId;

  if (!wid) {
    throw new Error('Toggl workspace_id is missing');
  }

  const url = `${TOGGL_V9_BASE}/workspaces/${wid}/time_entries/${entryId}/stop`;

  return externalApi(
    url,
    'PATCH',
    {
      tokenKey: 'togglApiToken',
      tokenValue: settings.togglApiToken
    }
  );
}


// =====================================================
// タスク開始 / 停止
// =====================================================
async function handleStartTask(title) {
  const res = await startToggl(title);

  settings.currentRunningTask = {
    title,
    togglEntryId: res.id
  };
  settings.startTime = Date.now();

  dom.runningTaskTitle.textContent = title;
  dom.runningTaskContainer.classList.remove('hidden');
  dom.taskListContainer.innerHTML = '';

  startTimerUI();
  showNotification('▶️ 計測開始');
}

async function handleStopTask() {
  const entryId = settings.currentRunningTask?.togglEntryId;
  if (!entryId) return;

 
  await stopToggl(entryId);

  settings.currentRunningTask = null;
  settings.startTime = null;
  stopTimerUI();

  dom.runningTaskContainer.classList.add('hidden');
  showNotification('⏹ 計測停止');
}

// =====================================================
// Timer UI
// =====================================================
function startTimerUI() {
  clearInterval(settings.timerInterval);
  settings.timerInterval = setInterval(() => {
    dom.runningTimer.textContent = formatTime(Date.now() - settings.startTime);
  }, 1000);
}

function stopTimerUI() {
  clearInterval(settings.timerInterval);
  dom.runningTimer.textContent = '00:00:00';
}

// =====================================================
// ダミータスク表示（Notion連携未接続でも確認可能）
// =====================================================
function renderDummyTasks() {
  dom.taskListContainer.innerHTML = '';

  ['作業A','作業B','作業C'].forEach(title => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-green';
    btn.textContent = `▶ ${title}`;
    btn.onclick = () => handleStartTask(title);
    dom.taskListContainer.appendChild(btn);
  });
}

// =====================================================
// Init
// =====================================================
function init() {
  dom = getDomElements();
  loadSettings();

  dom.toggleSettings.onclick = () => {
    dom.settingsView.classList.remove('hidden');
    dom.mainView.classList.add('hidden');
  };

  dom.cancelConfig.onclick = () => {
    dom.settingsView.classList.add('hidden');
    dom.mainView.classList.remove('hidden');
  };

  dom.saveConfig.onclick = () => {
    settings.notionToken = dom.confNotionToken.value.trim();
    settings.humanUserId = dom.confNotionUserId.value.trim();
    settings.togglApiToken = dom.confTogglToken.value.trim();
    settings.togglWorkspaceId = dom.confTogglWid.value.trim();
    saveSettings();
    showNotification('設定保存');
  };

  dom.stopTaskButton.onclick = handleStopTask;

  renderDummyTasks();

  console.log('✅ init 完了', dom);
}

init();
