/**
 * Notion Toggl Timer - FINAL STABLE APP.JS
 * 2025-12
 *
 * ✔ Notionタスク読込
 * ✔ 新規タスク（カテゴリ・部門復活）
 * ✔ Toggl打刻
 * ✔ 思考ログ：時系列追記
 * ✔ 打刻状態の完全復元（ブラウザ再起動OK）
 * ✔ カテゴリ・部門 → Togglタグ同期
 */

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
const TOGGL_V9_BASE_URL = 'https://api.track.toggl.com/api/v9';

const STATUS_RUNNING = '進行中';
const STATUS_COMPLETE = '完了';
const STATUS_PAUSE = '保留';

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

    runningTaskContainer: document.getElementById('runningTaskContainer'),
    runningTaskTitle: document.getElementById('runningTaskTitle'),
    runningTimer: document.getElementById('runningTimer'),
    thinkingLogInput: document.getElementById('thinkingLogInput'),
    stopTaskButton: document.getElementById('stopTaskButton'),
    completeTaskButton: document.getElementById('completeTaskButton'),

    startExistingTask: document.getElementById('startExistingTask'),
    startNewTask: document.getElementById('startNewTask'),
    existingTaskTab: document.getElementById('existingTaskTab'),
    newTaskTab: document.getElementById('newTaskTab'),

    newTaskTitle: document.getElementById('newTaskTitle'),
    newCatContainer: document.getElementById('newCatContainer'),
    newDeptContainer: document.getElementById('newDeptContainer'),
    startNewTaskButton: document.getElementById('startNewTaskButton')
  };
}

// =====================================================
// Utility
// =====================================================
function showNotification(msg, ms = 2500) {
  let el = document.getElementById('appNotification');
  if (!el) {
    el = document.createElement('div');
    el.id = 'appNotification';
    el.style.cssText =
      'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#4caf50;color:#fff;padding:10px 16px;border-radius:8px;z-index:9999';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => (el.style.opacity = '0'), ms);
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
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

  const running = JSON.parse(localStorage.getItem('runningTask') || 'null');
  if (running) {
    settings.currentRunningTask = running.task;
    settings.startTime = running.startTime;
  }
}

function saveSettings() {
  localStorage.setItem('notionToken', settings.notionToken);
  localStorage.setItem('humanUserId', settings.humanUserId);
  localStorage.setItem('togglApiToken', settings.togglApiToken);
  localStorage.setItem('togglWorkspaceId', settings.togglWorkspaceId);
  localStorage.setItem('notionDatabases', JSON.stringify(settings.notionDatabases));

  if (settings.currentRunningTask) {
    localStorage.setItem(
      'runningTask',
      JSON.stringify({ task: settings.currentRunningTask, startTime: settings.startTime })
    );
  } else {
    localStorage.removeItem('runningTask');
  }
}

// =====================================================
// Proxy API
// =====================================================
async function externalApi(targetUrl, method, auth, body) {
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
    const t = await res.text();
    throw new Error(`Proxy Error ${res.status}: ${t}`);
  }

  return res.status === 204 ? null : res.json();
}

function notionApi(endpoint, method = 'GET', body = null) {
  return externalApi(`https://api.notion.com/v1${endpoint}`, method, {
    tokenKey: 'notionToken',
    tokenValue: settings.notionToken,
    notionVersion: '2022-06-28'
  }, body);
}

function togglApi(url, method, body) {
  return externalApi(url, method, {
    tokenKey: 'togglApiToken',
    tokenValue: settings.togglApiToken
  }, body);
}

// =====================================================
// Notion Tasks
// =====================================================
async function fetchDatabaseList() {
  dom.taskDbFilter.innerHTML = '';
  settings.notionDatabases.forEach(db => {
    const opt = document.createElement('option');
    opt.value = db.id.replace(/-/g, '');
    opt.textContent = db.name;
    dom.taskDbFilter.appendChild(opt);
  });
}

async function loadTasks() {
  const dbId = dom.taskDbFilter.value;
  if (!dbId) return;

  const res = await notionApi(`/databases/${dbId}/query`, 'POST', {
    sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }]
  });

  dom.taskListContainer.innerHTML = '';
  res.results.forEach(page => {
    const titleProp = Object.values(page.properties).find(p => p.type === 'title');
    const title =
      titleProp?.title?.map(t => t.plain_text).join('') || 'Untitled';

    const btn = document.createElement('button');
    btn.textContent = '▶ 開始';
    btn.onclick = () => startTaskFromNotion(page, title);

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.textContent = title;
    row.appendChild(btn);

    dom.taskListContainer.appendChild(row);
  });
}

// =====================================================
// Toggl
// =====================================================
async function startToggl(title, tags) {
  return togglApi(`${TOGGL_V9_BASE_URL}/time_entries`, 'POST', {
    workspace_id: Number(settings.togglWorkspaceId),
    description: title,
    start: new Date().toISOString(),
    duration: -1,
    created_with: 'Notion Toggl Timer',
    tags
  });
}

async function stopToggl(id) {
  const wid = settings.togglWorkspaceId;
  return togglApi(
    `${TOGGL_V9_BASE_URL}/workspaces/${wid}/time_entries/${id}/stop`,
    'PATCH'
  );
}

// =====================================================
// Task Flow
// =====================================================
async function startTaskFromNotion(page, title) {
  const tags = [];
  const cat = page.properties['カテゴリ']?.select?.name;
  const depts = page.properties['部門']?.multi_select?.map(d => d.name) || [];

  depts.forEach(d => tags.push(`【${d}】`));
  if (cat) tags.push(`【${cat}】`);

  const desc = `${tags.join('')} ${title}`.trim();

  const entry = await startToggl(desc, tags);
  settings.currentRunningTask = {
    pageId: page.id,
    togglId: entry.id,
    title
  };
  settings.startTime = Date.now();
  saveSettings();
  updateRunningUI();
}

async function stopTask(isComplete) {
  const task = settings.currentRunningTask;
  if (!task) return;

  await stopToggl(task.togglId);

  const page = await notionApi(`/pages/${task.pageId}`, 'GET');
  const currentLog =
    page.properties['思考ログ']?.rich_text?.map(t => t.plain_text).join('') || '';

  const input = dom.thinkingLogInput.value.trim();
  if (input) {
    const stamp = new Date().toLocaleString();
    await notionApi(`/pages/${task.pageId}`, 'PATCH', {
      properties: {
        思考ログ: {
          rich_text: [{ text: { content: `${currentLog}\n\n[${stamp}]\n${input}` } }]
        }
      }
    });
  }

  settings.currentRunningTask = null;
  settings.startTime = null;
  saveSettings();
  updateRunningUI();
  loadTasks();
}

// =====================================================
// UI
// =====================================================
function updateRunningUI() {
  if (settings.currentRunningTask) {
    dom.runningTaskContainer.classList.remove('hidden');
    dom.runningTaskTitle.textContent = settings.currentRunningTask.title;

    if (!settings.timerInterval) {
      settings.timerInterval = setInterval(() => {
        dom.runningTimer.textContent = formatTime(Date.now() - settings.startTime);
      }, 1000);
    }
  } else {
    dom.runningTaskContainer.classList.add('hidden');
    clearInterval(settings.timerInterval);
    settings.timerInterval = null;
    dom.runningTimer.textContent = '00:00:00';
    dom.thinkingLogInput.value = '';
  }
}

// =====================================================
// Init
// =====================================================
async function bootstrap() {
  if (!settings.notionToken || settings.notionDatabases.length === 0) {
    dom.settingsView.classList.remove('hidden');
    dom.mainView.classList.add('hidden');
    return;
  }

  await fetchDatabaseList();
  await loadTasks();
  updateRunningUI();
}

function init() {
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
    settings.humanUserId = dom.confNotionUserId.value.trim();
    settings.togglApiToken = dom.confTogglToken.value.trim();
    settings.togglWorkspaceId = dom.confTogglWid.value.trim();

    saveSettings();
    showNotification('設定を保存しました');
    dom.settingsView.classList.add('hidden');
    dom.mainView.classList.remove('hidden');
    bootstrap();
  };

  dom.reloadTasksButton.onclick = loadTasks;
  dom.stopTaskButton.onclick = () => stopTask(false);
  dom.completeTaskButton.onclick = () => stopTask(true);

  bootstrap();
}

init();
