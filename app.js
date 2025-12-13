// =====================================================
// 🔒 SAFETY PATCH（Toggl 直叩き防止）
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

  current: null, // { page, togglId, startTime, durationPropName }
  timer: null
};

let dom = {};
let dbPropsCache = {};

// =====================================================
// DOM
// =====================================================
function getDom() {
  return {
    mainView: document.getElementById('mainView'),
    settingsView: document.getElementById('settingsView'),

    toggleSettingsButton: document.getElementById('toggleSettings'),
    cancelConfigButton: document.getElementById('cancelConfig'),
    saveConfigButton: document.getElementById('saveConfig'),
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
    completeTaskButton: document.getElementById('completeTaskButton')
  };
}

// =====================================================
// Utility
// =====================================================
function notify(msg) {
  console.log('ℹ️', msg);
}

function format(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function elapsedMinutes(start) {
  return Math.max(1, Math.round((Date.now() - start) / 60000));
}

// =====================================================
// Storage
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
// Proxy wrapper
// =====================================================
async function externalApi(targetUrl, method, tokenKey, tokenValue, body, notionVersion) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetUrl,
      method,
      tokenKey,
      tokenValue,
      body,
      notionVersion
    })
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Proxy Error ${res.status}: ${t}`);
  }
  return res.status === 204 ? null : res.json();
}

const notionApi = (ep, m = 'GET', b = null) =>
  externalApi(`https://api.notion.com/v1${ep}`, m, 'notionToken', settings.notionToken, b, '2022-06-28');

const togglApi = (url, m = 'GET', b = null) =>
  externalApi(url, m, 'togglApiToken', settings.togglApiToken, b);

// =====================================================
// DB helpers（A & B）
// =====================================================
function extractMetaProps(props) {
  let categoryProp = null;
  let deptProp = null;
  let durationProp = null;

  Object.entries(props).forEach(([name, p]) => {
    if (p.type === 'select' && !categoryProp) categoryProp = { name, ...p };
    if (p.type === 'multi_select' && !deptProp) deptProp = { name, ...p };
    if (p.type === 'number' && !durationProp) durationProp = name;
  });

  return { categoryProp, deptProp, durationProp };
}

function renderNewTaskMeta(categoryProp, deptProp) {
  dom.newCatContainer.innerHTML = '';
  dom.newDeptContainer.innerHTML = '';

  if (categoryProp) {
    const sel = document.createElement('select');
    sel.id = 'newTaskCategory';
    sel.className = 'input-field';
    categoryProp.select.options.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = o.name;
      sel.appendChild(opt);
    });
    dom.newCatContainer.appendChild(sel);
  }

  if (deptProp) {
    deptProp.multi_select.options.forEach(o => {
      const l = document.createElement('label');
      l.style.marginRight = '8px';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = o.id;
      l.appendChild(cb);
      l.appendChild(document.createTextNode(o.name));
      dom.newDeptContainer.appendChild(l);
    });
  }
}

// =====================================================
// Notion tasks
// =====================================================
async function loadDbProps(dbId) {
  if (dbPropsCache[dbId]) return dbPropsCache[dbId];
  const db = await notionApi(`/databases/${dbId}`);
  dbPropsCache[dbId] = db.properties;
  return db.properties;
}

async function loadTasks() {
  dom.taskListContainer.innerHTML = '';
  const dbId = dom.taskDbFilter.value;
  if (!dbId) return;

  const res = await notionApi(`/databases/${dbId}/query`, 'POST', {});
  const props = await loadDbProps(dbId);
  const meta = extractMetaProps(props);

  renderNewTaskMeta(meta.categoryProp, meta.deptProp);

  res.results.forEach(p => {
    const li = document.createElement('div');
    li.textContent = p.properties.Name?.title?.[0]?.plain_text || 'Untitled';
    li.onclick = () => startTask(p, meta.durationProp);
    dom.taskListContainer.appendChild(li);
  });
}

// =====================================================
// Toggl
// =====================================================
async function startToggl(title) {
  const body = {
    workspace_id: Number(settings.togglWorkspaceId),
    description: title,
    start: new Date().toISOString(),
    duration: -1,
    created_with: 'NotionTogglTimer'
  };
  return togglApi(`${TOGGL_V9_BASE}/time_entries`, 'POST', body);
}

async function stopToggl(id) {
  return togglApi(`${TOGGL_V9_BASE}/workspaces/${settings.togglWorkspaceId}/time_entries/${id}/stop`, 'PATCH');
}

// =====================================================
// Run / Stop / Complete
// =====================================================
async function startTask(page, durationPropName) {
  const title = page.properties.Name?.title?.[0]?.plain_text || 'Task';
  const te = await startToggl(title);

  settings.current = {
    page,
    togglId: te.id,
    startTime: Date.now(),
    durationPropName
  };

  dom.runningTaskTitle.textContent = title;
  dom.runningTaskContainer.classList.remove('hidden');

  settings.timer = setInterval(() => {
    dom.runningTimer.textContent = format(Date.now() - settings.current.startTime);
  }, 1000);
}

async function stopCurrent(complete = false) {
  if (!settings.current) return;

  await stopToggl(settings.current.togglId);

  if (settings.current.durationPropName) {
    const add = elapsedMinutes(settings.current.startTime);
    const cur =
      settings.current.page.properties[settings.current.durationPropName]?.number || 0;

    await notionApi(`/pages/${settings.current.page.id}`, 'PATCH', {
      properties: {
        [settings.current.durationPropName]: { number: cur + add }
      }
    });
  }

  if (complete) {
    await notionApi(`/pages/${settings.current.page.id}`, 'PATCH', {
      properties: { Status: { select: { name: '完了' } } }
    });
  }

  clearInterval(settings.timer);
  settings.current = null;
  dom.runningTaskContainer.classList.add('hidden');
}

// =====================================================
// Settings UI
// =====================================================
function renderDbConfig() {
  dom.dbConfigContainer.innerHTML = '';
  settings.notionDatabases.forEach((d, i) => {
    const row = document.createElement('div');
    row.innerHTML = `
      <input class="input-field db-name" value="${d.name || ''}" placeholder="DB名">
      <input class="input-field db-id" value="${d.id || ''}" placeholder="Database ID">
    `;
    dom.dbConfigContainer.appendChild(row);
  });
}

function showSettings() {
  dom.confNotionToken.value = settings.notionToken;
  dom.confNotionUserId.value = settings.humanUserId;
  dom.confTogglToken.value = settings.togglApiToken;
  dom.confTogglWid.value = settings.togglWorkspaceId;
  renderDbConfig();
  dom.settingsView.classList.remove('hidden');
  dom.mainView.classList.add('hidden');
}

function saveConfig() {
  settings.notionToken = dom.confNotionToken.value.trim();
  settings.humanUserId = dom.confNotionUserId.value.trim();
  settings.togglApiToken = dom.confTogglToken.value.trim();
  settings.togglWorkspaceId = dom.confTogglWid.value.trim();

  const names = document.querySelectorAll('.db-name');
  const ids = document.querySelectorAll('.db-id');
  settings.notionDatabases = [];
  names.forEach((n, i) => {
    if (n.value && ids[i].value)
      settings.notionDatabases.push({ name: n.value, id: ids[i].value });
  });

  saveSettings();
  initDbSelector();
  dom.settingsView.classList.add('hidden');
  dom.mainView.classList.remove('hidden');
}

// =====================================================
// Init
// =====================================================
function initDbSelector() {
  dom.taskDbFilter.innerHTML = '';
  settings.notionDatabases.forEach(d => {
    const o = document.createElement('option');
    o.value = d.id;
    o.textContent = d.name;
    dom.taskDbFilter.appendChild(o);
  });
}

function init() {
  dom = getDom();
  loadSettings();
  initDbSelector();

  dom.toggleSettingsButton.onclick = showSettings;
  dom.cancelConfigButton.onclick = () => {
    dom.settingsView.classList.add('hidden');
    dom.mainView.classList.remove('hidden');
  };
  dom.saveConfigButton.onclick = saveConfig;
  dom.addDbConfigButton.onclick = () => {
    settings.notionDatabases.push({ name: '', id: '' });
    renderDbConfig();
  };

  dom.reloadTasksButton.onclick = loadTasks;
  dom.stopTaskButton.onclick = () => stopCurrent(false);
  dom.completeTaskButton.onclick = () => stopCurrent(true);

  notify('✅ init 完了');
}

init();
