console.log('🔥 APP.JS PROXY BUILD 2025-12-12 FINAL');

// =====================================================
// 🔒 SAFETY PATCH: Toggl直叩き完全防止 & デバッグ可視化
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
      console.error('🚨 BLOCKED: Direct Toggl API call detected', url);
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
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function showNotification(message, duration = 3000) {
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
      padding: 10px 20px;
      border-radius: 6px;
      z-index: 9999;
      opacity: 0;
      transition: opacity .3s;
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
    taskSelectionSection: document.getElementById('taskSelectionSection'),

    toggleKpiReportBtn: document.getElementById('toggleKpiReportBtn'),
    kpiReportTab: document.getElementById('kpiReportTab'),
    reportPeriodSelect: document.getElementById('reportPeriodSelect'),
    fetchKpiButton: document.getElementById('fetchKpiButton'),
    reportTotalTime: document.getElementById('reportTotalTime'),
    kpiResultsContainer: document.getElementById('kpiResultsContainer')
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
    throw new Error(`API Error (${res.status}): ${e.message}`);
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
      tokenValue: settings.togglApiToken,
      notionVersion: '2022-06-28'
    },
    body
  );
}

// =====================================================
// KPI
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

  const entries = await externalTogglApi(url, 'POST', {
    start_date: start.toISOString(),
    end_date: end.toISOString()
  });

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
// Init
// =====================================================
function init() {
  dom = getDomElements();
  loadSettings();

  dom.fetchKpiButton?.addEventListener('click', fetchKpiReport);
  dom.toggleSettingsButton?.addEventListener('click', () => {
    dom.settingsView.classList.remove('hidden');
    dom.mainView.classList.add('hidden');
  });
  dom.cancelConfigButton?.addEventListener('click', () => {
    dom.settingsView.classList.add('hidden');
    dom.mainView.classList.remove('hidden');
  });
}

init();
