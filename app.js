// =====================================================
// 🔒 SAFETY PATCH（最終・誤爆防止版）
// =====================================================
(() => {
  if (typeof window.fetch !== 'function') {
    console.warn('⚠️ SAFETY PATCH: fetch is not available. Skipped.');
    return;
  }

  const originalFetch = window.fetch.bind(window);

  window.fetch = function (input, init = {}) {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof Request
        ? input.url
        : '';

    // 🚨 Toggl API 直叩きは禁止（proxy以外）
    if (
      url &&
      url.includes('api.track.toggl.com') &&
      !url.includes('/api/proxy')
    ) {
      console.error('🚨 BLOCKED: Direct Toggl API call detected', url);
      throw new Error('Direct Toggl API call blocked. Use proxy.');
    }

    if (url && url.includes('/api/proxy')) {
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

const STATUS_INCOMPLETE = ['未着手', '進行中'];
const STATUS_RUNNING = '進行中';
const STATUS_COMPLETE = '完了';
const STATUS_PAUSE = '保留';

// =====================================================
// 状態
// =====================================================
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

const dbPropertiesCache = {};
let dom = null;

// =====================================================
// Utility
// =====================================================
function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

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
      opacity: 0;
      transition: opacity .25s;
      font-size: 14px;
      box-shadow: 0 10px 18px rgba(0,0,0,.18);
      max-width: 80vw;
      white-space: pre-wrap;
    `;
    document.body.appendChild(n);
  }
  n.textContent = message;
  n.style.opacity = '1';
  clearTimeout(n._timer);
  n._timer = setTimeout(() => (n.style.opacity = '0'), duration);
}

function clearElement(el) {
  if (el) el.innerHTML = '';
}

function normalizeDbId(id) {
  return String(id || '').replace(/-/g, '').trim();
}

// =====================================================
// DOM取得（KPI要素は完全除外）
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
    reloadTasksButton: document.getElementById('reloadTasks'),

    runningTaskContainer: document.getElementById('runningTaskContainer'),
    runningTaskTitle: document.getElementById('runningTaskTitle'),
    runningTimer: document.getElementById('runningTimer'),
    thinkingLogInput: document.getElementById('thinkingLogInput'),

    stopTaskButton: document.getElementById('stopTaskButton'),
    completeTaskButton: document.getElementById('completeTaskButton'),

    newTaskForm: document.getElementById('newTaskForm'),
    newTaskTitle: document.getElementById('newTaskTitle'),
    newCatContainer: document.getElementById('newCatContainer'),
    newDeptContainer: document.getElementById('newDeptContainer'),
    targetDbDisplay: document.getElementById('targetDbDisplay'),
    startNewTaskButton: document.getElementById('startNewTaskButton'),

    startExistingTask: document.getElementById('startExistingTask'),
    startNewTask: document.getElementById('startNewTask'),
    existingTaskTab: document.getElementById('existingTaskTab'),
    newTaskTab: document.getElementById('newTaskTab'),
    taskSelectionSection: document.getElementById('taskSelectionSection')
  };
}

// =====================================================
// Settings（LocalStorage）
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

  try {
    const running = JSON.parse(localStorage.getItem('runningTask') || 'null');
    if (running?.task && running?.startTime) {
      settings.currentRunningTask = running.task;
      settings.startTime = running.startTime;
    }
  } catch {}
}

function saveSettings() {
  localStorage.setItem('notionToken', settings.notionToken);
  localStorage.setItem('humanUserId', settings.humanUserId);
  localStorage.setItem('togglApiToken', settings.togglApiToken);
  localStorage.setItem('togglWorkspaceId', settings.togglWorkspaceId);
  localStorage.setItem('notionDatabases', JSON.stringify(settings.notionDatabases));

  if (settings.currentRunningTask && settings.startTime) {
    localStorage.setItem('runningTask', JSON.stringify({
      task: settings.currentRunningTask,
      startTime: settings.startTime
    }));
  } else {
    localStorage.removeItem('runningTask');
  }
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
    throw new Error(`API Error (${res.status}): ${e.message || 'Proxy Error'}`);
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
      notionVersion: '2022-06-28'
    },
    body
  );
}

function externalTogglApi(url, method = 'GET', body = null) {
  return externalApi(
    url,
    method,
    {
      tokenKey: 'togglApiToken',
      tokenValue: settings.togglApiToken
    },
    body
  );
}

// =====================================================
// Toggl start / stop
// =====================================================
async function startToggl(title, tags = []) {
  const url = `${TOGGL_V9_BASE_URL}/time_entries`;
  const body = {
    workspace_id: Number(settings.togglWorkspaceId),
    description: title,
    created_with: 'Notion Toggl Timer WebApp',
    start: new Date().toISOString(),
    duration: -1,
    tags
  };
  return externalTogglApi(url, 'POST', body);
}

async function stopToggl(entryId) {
  const wid = settings.togglWorkspaceId;
  const url = `${TOGGL_V9_BASE_URL}/workspaces/${wid}/time_entries/${entryId}/stop`;
  return externalTogglApi(url, 'PATCH');
}

// =====================================================
// タブ切替（KPIなし）
// =====================================================
function switchTab(event) {
  const target = event.currentTarget.dataset.target;

  dom.startExistingTask.classList.remove('active');
  dom.startNewTask.classList.remove('active');
  event.currentTarget.classList.add('active');

  dom.taskSelectionSection.classList.remove('hidden');

  if (target === 'existing') {
    dom.existingTaskTab.classList.remove('hidden');
    dom.newTaskTab.classList.add('hidden');
  }

  if (target === 'new') {
    dom.existingTaskTab.classList.add('hidden');
    dom.newTaskTab.classList.remove('hidden');
  }
}

// =====================================================
// Init
// =====================================================
function init() {
  dom = getDomElements();
  loadSettings();

  dom.toggleSettingsButton.addEventListener('click', () => {
    dom.settingsView.classList.remove('hidden');
    dom.mainView.classList.add('hidden');
  });

  dom.cancelConfigButton.addEventListener('click', () => {
    dom.settingsView.classList.add('hidden');
    dom.mainView.classList.remove('hidden');
  });

  dom.startExistingTask.addEventListener('click', switchTab);
  dom.startNewTask.addEventListener('click', switchTab);

  showNotification('アプリ起動完了');
}

init();
