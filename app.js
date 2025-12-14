/************************************************
 * Notion × Toggl Timer
 * app.js FINAL STABLE
 ************************************************/

// ===============================
// 定数
// ===============================
const PROXY_URL = 'https://company-notion-toggl-api.vercel.app/api/proxy';
const TOGGL_V9_BASE = 'https://api.track.toggl.com/api/v9';

// ===============================
// 状態
// ===============================
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
let dom = {};

// ===============================
// DOM取得
// ===============================
function getDomElements() {
  return {
    mainView: document.getElementById('mainView'),
    settingsView: document.getElementById('settingsView'),

    toggleSettingsButton: document.getElementById('toggleSettings'),
    saveConfigButton: document.getElementById('saveConfig'),
    cancelConfigButton: document.getElementById('cancelConfig'),
    addDbConfigButton: document.getElementById('addDbConfig'),

    confNotionToken: document.getElementById('confNotionToken'),
    confNotionUserId: document.getElementById('confNotionUserId'),
    confTogglToken: document.getElementById('confTogglToken'),
    confTogglWid: document.getElementById('confTogglWid'),

    dbConfigContainer: document.getElementById('dbConfigContainer'),

    taskDbFilter: document.getElementById('taskDbFilter'),
    reloadTasksButton: document.getElementById('reloadTasks'),
    taskListContainer: document.getElementById('taskListContainer'),

    startExistingTask: document.getElementById('startExistingTask'),
    startNewTask: document.getElementById('startNewTask'),
    existingTaskTab: document.getElementById('existingTaskTab'),
    newTaskTab: document.getElementById('newTaskTab'),

    newTaskTitle: document.getElementById('newTaskTitle'),
    newCatContainer: document.getElementById('newCatContainer'),
    newDeptContainer: document.getElementById('newDeptContainer'),
    startNewTaskButton: document.getElementById('startNewTaskButton'),

    runningTaskContainer: document.getElementById('runningTaskContainer'),
    runningTaskTitle: document.getElementById('runningTaskTitle'),
    runningTimer: document.getElementById('runningTimer'),
    thinkingLogInput: document.getElementById('thinkingLogInput'),
    stopTaskButton: document.getElementById('stopTaskButton'),
    completeTaskButton: document.getElementById('completeTaskButton'),
  };
}

// ===============================
// Utility
// ===============================
function showNotification(msg, ms = 2500) {
  let n = document.getElementById('appNotification');
  if (!n) {
    n = document.createElement('div');
    n.id = 'appNotification';
    n.style.cssText = `
      position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
      background:#333;color:#fff;padding:10px 16px;border-radius:6px;
      z-index:9999;font-size:14px;
    `;
    document.body.appendChild(n);
  }
  n.textContent = msg;
  n.style.opacity = '1';
  clearTimeout(n._t);
  n._t = setTimeout(() => (n.style.opacity = '0'), ms);
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

// ===============================
// Storage
// ===============================
function loadSettings() {
  settings.notionToken = localStorage.getItem('notionToken') || '';
  settings.humanUserId = localStorage.getItem('humanUserId') || '';
  settings.togglApiToken = localStorage.getItem('togglApiToken') || '';
  settings.togglWorkspaceId = localStorage.getItem('togglWorkspaceId') || '';
  settings.notionDatabases = JSON.parse(localStorage.getItem('notionDatabases') || '[]');

  const r = localStorage.getItem('runningTask');
  if (r) {
    const j = JSON.parse(r);
    settings.currentRunningTask = j.task;
    settings.startTime = j.startTime;
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

// ===============================
// Settings UI
// ===============================
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
    row.style.marginBottom = '8px';
    dom.dbConfigContainer.appendChild(row);
  });
}

function showSettings() {
  dom.confNotionToken.value = settings.notionToken;
  dom.confNotionUserId.value = settings.humanUserId;
  dom.confTogglToken.value = settings.togglApiToken;
  dom.confTogglWid.value = settings.togglWorkspaceId;
  renderDbConfigForms();

  dom.addDbConfigButton.onclick = () => {
    settings.notionDatabases.push({ name: '', id: '' });
    renderDbConfigForms();
  };

  dom.mainView.classList.add('hidden');
  dom.settingsView.classList.remove('hidden');
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
  const list = [];
  names.forEach((n, i) => {
    if (n.value && ids[i].value) {
      list.push({ name: n.value, id: ids[i].value });
    }
  });
  settings.notionDatabases = list;
  saveSettings();
  hideSettings();
  fetchDatabaseList().then(loadTasks);
  showNotification('設定を保存しました');
}

// ===============================
// API
// ===============================
async function proxyApi(targetUrl, method, tokenKey, tokenValue, body) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetUrl,
      method,
      tokenKey,
      tokenValue,
      body
    })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t);
  }
  return res.status === 204 ? null : res.json();
}

const notionApi = (path, method = 'GET', body) =>
  proxyApi(`https://api.notion.com/v1${path}`, method, 'notionToken', settings.notionToken, body);

const togglApi = (url, method, body) =>
  proxyApi(url, method, 'togglApiToken', settings.togglApiToken, body);

// ===============================
// Notion
// ===============================
async function fetchDatabaseList() {
  settings.databases = [];
  for (const d of settings.notionDatabases) {
    const db = await notionApi(`/databases/${d.id}`, 'GET');
    settings.databases.push({ id: db.id, name: d.name });
  }
  dom.taskDbFilter.innerHTML = settings.databases
    .map(d => `<option value="${d.id}">${d.name}</option>`)
    .join('');
}

async function getDbProps(dbId) {
  if (dbPropertiesCache[dbId]) return dbPropertiesCache[dbId];
  const db = await notionApi(`/databases/${dbId}`, 'GET');
  const p = {};
  for (const k in db.properties) {
    const prop = db.properties[k];
    if (prop.type === 'title') p.title = { name: k };
    if (prop.type === 'select' && k === 'カテゴリ') p.category = { name: k, options: prop.select.options };
    if (prop.type === 'multi_select' && k === '部門') p.department = { name: k, options: prop.multi_select.options };
    if (prop.type === 'rich_text' && k.includes('思考')) p.log = { name: k };
    if (prop.type === 'number' && k.includes('計測')) p.duration = { name: k };
    if (prop.type === 'status') p.status = { name: k, options: prop.status.options };
  }
  dbPropertiesCache[dbId] = p;
  return p;
}

// ===============================
// Tasks
// ===============================
async function loadTasks() {
  const dbId = dom.taskDbFilter.value;
  const props = await getDbProps(dbId);
  const res = await notionApi(`/databases/${dbId}/query`, 'POST', {
    filter: { property: props.status.name, status: { does_not_equal: '完了' } }
  });

  dom.taskListContainer.innerHTML = '';
  res.results.forEach(t => {
    const title = t.properties[props.title.name]?.title?.[0]?.plain_text || '(無題)';
    const btn = document.createElement('button');
    btn.textContent = '▶ 開始';
    btn.onclick = () => startTask({
      id: t.id,
      dbId,
      title,
      props
    });

    const row = document.createElement('div');
    row.textContent = title;
    row.appendChild(btn);
    dom.taskListContainer.appendChild(row);
  });
}

// ===============================
// Toggl
// ===============================
async function startTask(task) {
  const entry = await togglApi(
    `${TOGGL_V9_BASE}/time_entries`,
    'POST',
    {
      description: task.title,
      workspace_id: Number(settings.togglWorkspaceId),
      created_with: 'Notion x Toggl Timer',
      start: new Date().toISOString(),
      duration: -1
    }
  );

  settings.currentRunningTask = { ...task, togglId: entry.id };
  settings.startTime = Date.now();
  saveSettings();
  updateRunning(true);
}

async function stopTask(isComplete) {
  const t = settings.currentRunningTask;
  await togglApi(
    `${TOGGL_V9_BASE}/workspaces/${settings.togglWorkspaceId}/time_entries/${t.togglId}/stop`,
    'PATCH'
  );

  const elapsed = Date.now() - settings.startTime;
  const props = await getDbProps(t.dbId);
  const page = await notionApi(`/pages/${t.id}`, 'GET');

  const patch = { properties: {} };

  if (props.duration) {
    const cur = page.properties[props.duration.name]?.number || 0;
    patch.properties[props.duration.name] = { number: cur + Math.round(elapsed / 60000) };
  }

  if (props.log && dom.thinkingLogInput.value) {
    const prev = page.properties[props.log.name]?.rich_text?.[0]?.plain_text || '';
    patch.properties[props.log.name] = {
      rich_text: [{ text: { content: `${prev}\n[${new Date().toLocaleString()}]\n${dom.thinkingLogInput.value}` } }]
    };
  }

  await notionApi(`/pages/${t.id}`, 'PATCH', patch);

  settings.currentRunningTask = null;
  settings.startTime = null;
  saveSettings();
  updateRunning(false);
  loadTasks();
}

// ===============================
// UI
// ===============================
function updateRunning(on) {
  if (on) {
    dom.runningTaskContainer.classList.remove('hidden');
    dom.runningTaskTitle.textContent = settings.currentRunningTask.title;
    dom.timerInterval = setInterval(() => {
      dom.runningTimer.textContent = formatTime(Date.now() - settings.startTime);
    }, 1000);
  } else {
    clearInterval(dom.timerInterval);
    dom.runningTaskContainer.classList.add('hidden');
    dom.runningTimer.textContent = '00:00:00';
  }
}

// ===============================
// Init
// ===============================
function init() {
  dom = getDomElements();
  loadSettings();

  dom.toggleSettingsButton.onclick = showSettings;
  dom.cancelConfigButton.onclick = hideSettings;
  dom.saveConfigButton.onclick = handleSaveSettings;

  dom.startExistingTask.onclick = () => {
    dom.existingTaskTab.classList.remove('hidden');
    dom.newTaskTab.classList.add('hidden');
  };
  dom.startNewTask.onclick = () => {
    dom.existingTaskTab.classList.add('hidden');
    dom.newTaskTab.classList.remove('hidden');
  };

  dom.startNewTaskButton.onclick = () => handleStartNewTask();
  dom.stopTaskButton.onclick = () => stopTask(false);
  dom.completeTaskButton.onclick = () => stopTask(true);

  if (settings.notionToken && settings.notionDatabases.length) {
    fetchDatabaseList().then(loadTasks);
  } else {
    showSettings();
  }
}

init();
