/* =====================================================
   Notion × Toggl Timer - STABLE COMPLETE VERSION
   ===================================================== */

const PROXY_URL = 'https://company-notion-toggl-api.vercel.app/api/proxy';
const TOGGL_V9_BASE_URL = 'https://api.track.toggl.com/api/v9';

const settings = {
  notionToken: '',
  notionDatabases: [],
  humanUserId: '',
  togglApiToken: '',
  togglWorkspaceId: '',
  currentRunningTask: null,
  startTime: null,
  timerInterval: null
};

const dbPropertiesCache = {};
let dom;

/* =====================================================
   DOM
===================================================== */
function getDom() {
  return {
    mainView: document.getElementById('mainView'),
    settingsView: document.getElementById('settingsView'),

    confNotionToken: document.getElementById('confNotionToken'),
    confNotionUserId: document.getElementById('confNotionUserId'),
    confTogglToken: document.getElementById('confTogglToken'),
    confTogglWid: document.getElementById('confTogglWid'),

    dbConfigContainer: document.getElementById('dbConfigContainer'),
    addDbConfig: document.getElementById('addDbConfig'),

    saveConfig: document.getElementById('saveConfig'),
    cancelConfig: document.getElementById('cancelConfig'),
    toggleSettings: document.getElementById('toggleSettings'),

    taskDbFilter: document.getElementById('taskDbFilter'),
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

/* =====================================================
   Utility
===================================================== */
function notify(msg) {
  let el = document.getElementById('appNotification');
  if (!el) {
    el = document.createElement('div');
    el.id = 'appNotification';
    el.style.cssText = `
      position:fixed;bottom:20px;left:50%;
      transform:translateX(-50%);
      background:#333;color:#fff;
      padding:10px 16px;border-radius:6px;
      z-index:9999;font-size:14px;
    `;
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  setTimeout(() => (el.style.opacity = '0'), 2500);
}

function format(ms) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(
    Math.floor((s % 3600) / 60)
  ).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/* =====================================================
   Settings
===================================================== */
function loadSettings() {
  Object.assign(settings, {
    notionToken: localStorage.getItem('notionToken') || '',
    notionDatabases: JSON.parse(localStorage.getItem('notionDatabases') || '[]'),
    humanUserId: localStorage.getItem('humanUserId') || '',
    togglApiToken: localStorage.getItem('togglApiToken') || '',
    togglWorkspaceId: localStorage.getItem('togglWorkspaceId') || ''
  });
  const rt = localStorage.getItem('runningTask');
  if (rt) {
    const r = JSON.parse(rt);
    settings.currentRunningTask = r.task;
    settings.startTime = r.startTime;
  }
}

function saveSettings() {
  localStorage.setItem('notionToken', settings.notionToken);
  localStorage.setItem('notionDatabases', JSON.stringify(settings.notionDatabases));
  localStorage.setItem('humanUserId', settings.humanUserId);
  localStorage.setItem('togglApiToken', settings.togglApiToken);
  localStorage.setItem('togglWorkspaceId', settings.togglWorkspaceId);
  if (settings.currentRunningTask) {
    localStorage.setItem(
      'runningTask',
      JSON.stringify({ task: settings.currentRunningTask, startTime: settings.startTime })
    );
  } else {
    localStorage.removeItem('runningTask');
  }
}

/* =====================================================
   Proxy API
===================================================== */
async function api(targetUrl, method, tokenKey, tokenValue, body) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetUrl,
      method,
      tokenKey,
      tokenValue,
      notionVersion: '2022-06-28',
      body
    })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.status === 204 ? null : res.json();
}

/* =====================================================
   Notion
===================================================== */
function notion(endpoint, method = 'GET', body) {
  return api(
    `https://api.notion.com/v1${endpoint}`,
    method,
    'notionToken',
    settings.notionToken,
    body
  );
}

async function getDbProps(dbId) {
  if (dbPropertiesCache[dbId]) return dbPropertiesCache[dbId];
  const res = await notion(`/databases/${dbId}`);
  const map = {};
  for (const [name, p] of Object.entries(res.properties)) {
    if (p.type === 'title') map.title = name;
    if (p.type === 'select' && ['カテゴリ', '優先度', '種別'].some(k => name.includes(k)))
      map.category = name;
    if (p.type === 'multi_select' && name.includes('部門')) map.department = name;
    if (p.type === 'status') map.status = name;
    if (p.type === 'rich_text' && name.includes('思考')) map.log = name;
    if (p.type === 'number' && name.includes('計測')) map.duration = name;
  }
  dbPropertiesCache[dbId] = map;
  return map;
}

/* =====================================================
   Toggl
===================================================== */
function togglStart(title, tags) {
  return api(
    `${TOGGL_V9_BASE_URL}/time_entries`,
    'POST',
    'togglApiToken',
    settings.togglApiToken,
    {
      created_with: 'NotionTogglTimer',
      workspace_id: Number(settings.togglWorkspaceId),
      description: title,
      start: new Date().toISOString(),
      duration: -1,
      tags
    }
  );
}

function togglStop(id) {
  return api(
    `${TOGGL_V9_BASE_URL}/workspaces/${settings.togglWorkspaceId}/time_entries/${id}/stop`,
    'PATCH',
    'togglApiToken',
    settings.togglApiToken
  );
}

/* =====================================================
   Tasks
===================================================== */
async function loadTasks() {
  const dbId = dom.taskDbFilter.value;
  dom.taskListContainer.innerHTML = '読み込み中…';
  const props = await getDbProps(dbId);
  const res = await notion(`/databases/${dbId}/query`, 'POST', {
    filter: props.status
      ? { property: props.status, status: { does_not_equal: '完了' } }
      : undefined
  });
  dom.taskListContainer.innerHTML = '';
  res.results.forEach(t => {
    const title = t.properties[props.title]?.title?.[0]?.plain_text || '無題';
    const btn = document.createElement('button');
    btn.textContent = '▶ 開始';
    btn.onclick = () => startTask(t.id, title, t.properties, dbId);
    const div = document.createElement('div');
    div.textContent = title;
    div.appendChild(btn);
    dom.taskListContainer.appendChild(div);
  });
}

async function startTask(id, title, props, dbId) {
  if (settings.currentRunningTask) return alert('実行中タスクあり');
  const tags = [];
  const map = await getDbProps(dbId);
  if (map.category && props[map.category]?.select)
    tags.push(props[map.category].select.name);
  if (map.department)
    props[map.department]?.multi_select?.forEach(d => tags.push(d.name));

  const entry = await togglStart(title, tags);
  settings.currentRunningTask = { id, dbId, title, togglId: entry.id };
  settings.startTime = Date.now();
  saveSettings();
  updateRunningUI();
}

async function stopTask(complete) {
  const t = settings.currentRunningTask;
  await togglStop(t.togglId);

  const map = await getDbProps(t.dbId);
  const elapsed = Math.round((Date.now() - settings.startTime) / 60000);

  const page = await notion(`/pages/${t.id}`);
  const body = { properties: {} };

  if (map.duration)
    body.properties[map.duration] = {
      number: (page.properties[map.duration]?.number || 0) + elapsed
    };

  if (map.log && dom.thinkingLogInput.value) {
    body.properties[map.log] = {
      rich_text: [
        {
          text: {
            content:
              (page.properties[map.log]?.rich_text?.[0]?.plain_text || '') +
              `\n[${new Date().toLocaleString()}]\n${dom.thinkingLogInput.value}`
          }
        }
      ]
    };
  }

  if (map.status)
    body.properties[map.status] = {
      status: { name: complete ? '完了' : '保留' }
    };

  await notion(`/pages/${t.id}`, 'PATCH', body);

  settings.currentRunningTask = null;
  settings.startTime = null;
  dom.thinkingLogInput.value = '';
  saveSettings();
  updateRunningUI();
  loadTasks();
}

/* =====================================================
   UI
===================================================== */
function updateRunningUI() {
  if (settings.currentRunningTask) {
    dom.runningTaskContainer.classList.remove('hidden');
    dom.runningTaskTitle.textContent = settings.currentRunningTask.title;
    if (!settings.timerInterval)
      settings.timerInterval = setInterval(
        () =>
          (dom.runningTimer.textContent = format(Date.now() - settings.startTime)),
        1000
      );
  } else {
    dom.runningTaskContainer.classList.add('hidden');
    clearInterval(settings.timerInterval);
    settings.timerInterval = null;
  }
}

/* =====================================================
   Init
===================================================== */
function init() {
  dom = getDom();
  loadSettings();

  dom.toggleSettings.onclick = () => dom.settingsView.classList.remove('hidden');
  dom.cancelConfig.onclick = () => dom.settingsView.classList.add('hidden');

  dom.saveConfig.onclick = () => {
    settings.notionToken = dom.confNotionToken.value.trim();
    settings.humanUserId = dom.confNotionUserId.value.trim();
    settings.togglApiToken = dom.confTogglToken.value.trim();
    settings.togglWorkspaceId = dom.confTogglWid.value.trim();
    saveSettings();
    dom.settingsView.classList.add('hidden');
    notify('設定保存');
    loadTasks();
  };

  dom.taskDbFilter.onchange = loadTasks;
  dom.stopTaskButton.onclick = () => stopTask(false);
  dom.completeTaskButton.onclick = () => stopTask(true);

  if (settings.notionDatabases.length) {
    dom.taskDbFilter.innerHTML = settings.notionDatabases
      .map(d => `<option value="${d.id}">${d.name}</option>`)
      .join('');
    loadTasks();
    updateRunningUI();
  } else {
    dom.settingsView.classList.remove('hidden');
  }
}

init();
