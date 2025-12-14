// =====================================================
// 定数
// =====================================================
const PROXY_URL = 'https://company-notion-toggl-api.vercel.app/api/proxy';
const TOGGL_BASE = 'https://api.track.toggl.com/api/v9';

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
let dom;

// =====================================================
// DOM
// =====================================================
function getDom() {
  return {
    mainView: document.getElementById('mainView'),
    settingsView: document.getElementById('settingsView'),
    toggleSettings: document.getElementById('toggleSettings'),
    cancelConfig: document.getElementById('cancelConfig'),
    saveConfig: document.getElementById('saveConfig'),
    addDbConfig: document.getElementById('addDbConfig'),

    confNotionToken: document.getElementById('confNotionToken'),
    confNotionUserId: document.getElementById('confNotionUserId'),
    confTogglToken: document.getElementById('confTogglToken'),
    confTogglWid: document.getElementById('confTogglWid'),
    dbConfigContainer: document.getElementById('dbConfigContainer'),

    taskDbFilter: document.getElementById('taskDbFilter'),
    reloadTasks: document.getElementById('reloadTasks'),
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
// ユーティリティ
// =====================================================
function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

function notify(msg) {
  console.log('🔔', msg);
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

  const rt = localStorage.getItem('runningTask');
  if (rt) {
    const d = JSON.parse(rt);
    settings.currentRunningTask = d.task;
    settings.startTime = d.startTime;
  }
}

function saveSettings() {
  localStorage.setItem('notionToken', settings.notionToken);
  localStorage.setItem('humanUserId', settings.humanUserId);
  localStorage.setItem('togglApiToken', settings.togglApiToken);
  localStorage.setItem('togglWorkspaceId', settings.togglWorkspaceId);
  localStorage.setItem('notionDatabases', JSON.stringify(settings.notionDatabases));

  if (settings.currentRunningTask) {
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
async function externalApi(targetUrl, method, tokenKey, tokenValue, body) {
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

const notionApi = (endpoint, method='GET', body=null) =>
  externalApi(`https://api.notion.com/v1${endpoint}`, method,
    'notionToken', settings.notionToken, body);

const togglApi = (url, method='GET', body=null) =>
  externalApi(url, method, 'togglApiToken', settings.togglApiToken, body);

// =====================================================
// Notion
// =====================================================
async function fetchDatabaseList() {
  settings.databases = [];
  for (const db of settings.notionDatabases) {
    const r = await notionApi(`/databases/${db.id}`);
    settings.databases.push({ id: r.id, name: db.name });
  }
  dom.taskDbFilter.innerHTML =
    settings.databases.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
}

async function getDbProps(dbId) {
  if (dbPropertiesCache[dbId]) return dbPropertiesCache[dbId];
  const r = await notionApi(`/databases/${dbId}`);
  const p = r.properties;
  const m = {};
  for (const k in p) {
    if (p[k].type === 'title') m.title = k;
    if (p[k].type === 'status') m.status = k;
    if (p[k].type === 'select') m.category = { name:k, options:p[k].select.options };
    if (p[k].type === 'multi_select') m.department = { name:k, options:p[k].multi_select.options };
    if (p[k].type === 'rich_text') m.log = k;
    if (p[k].type === 'number') m.duration = k;
  }
  dbPropertiesCache[dbId] = m;
  return m;
}

async function loadTasks() {
  const dbId = dom.taskDbFilter.value;
  const props = await getDbProps(dbId);

  const body = {
    filter: {
      or: [
        { property: props.status, status: { equals: '未着手' } },
        { property: props.status, status: { equals: '進行中' } }
      ]
    }
  };

  const res = await notionApi(`/databases/${dbId}/query`, 'POST', body);
  renderTaskList(res.results, dbId, props);
}

function renderTaskList(tasks, dbId, props) {
  const ul = document.createElement('ul');
  ul.className = 'task-list';

  tasks.forEach(t => {
    const title =
      t.properties[props.title].title.map(x=>x.plain_text).join('') || '無題';

    const li = document.createElement('li');
    li.innerHTML = `<span>${title}</span>`;

    const btn = document.createElement('button');
    btn.textContent = '▶ 開始';
    btn.className = 'btn green';
    btn.onclick = () => startTask({
      id: t.id,
      dbId,
      title,
      category: t.properties[props.category?.name]?.select?.name,
      departments: t.properties[props.department?.name]?.multi_select?.map(x=>x.name) || []
    });

    li.appendChild(btn);
    ul.appendChild(li);
  });

  dom.taskListContainer.innerHTML = '';
  dom.taskListContainer.appendChild(ul);
}

// =====================================================
// Toggl
// =====================================================
async function startToggl(desc, tags) {
  return togglApi(`${TOGGL_BASE}/time_entries`, 'POST', {
    workspace_id: Number(settings.togglWorkspaceId),
    description: desc,
    start: new Date().toISOString(),
    duration: -1,
    tags
  });
}

async function stopToggl(id) {
  return togglApi(
    `${TOGGL_BASE}/workspaces/${settings.togglWorkspaceId}/time_entries/${id}/stop`,
    'PATCH'
  );
}

// =====================================================
// Task Control
// =====================================================
async function startTask(task) {
  const desc =
    task.departments.map(d=>`【${d}】`).join('') +
    (task.category ? `【${task.category}】` : '') +
    task.title;

  const toggl = await startToggl(desc, [...task.departments, task.category].filter(Boolean));
  task.togglId = toggl.id;

  settings.currentRunningTask = task;
  settings.startTime = Date.now();
  saveSettings();
  updateRunning(true);
}

async function stopTask(isComplete) {
  const task = settings.currentRunningTask;
  await stopToggl(task.togglId);

  const props = await getDbProps(task.dbId);
  const page = await notionApi(`/pages/${task.id}`);

  const minutes = Math.round((Date.now()-settings.startTime)/60000);
  const cur = page.properties[props.duration]?.number || 0;

  const log = dom.thinkingLogInput.value.trim();
  const ts = new Date().toLocaleString();
  const newLog = log
    ? `${page.properties[props.log]?.rich_text?.[0]?.plain_text || ''}\n\n[${ts}]\n${log}`
    : undefined;

  await notionApi(`/pages/${task.id}`, 'PATCH', {
    properties: {
      ...(props.duration ? { [props.duration]: { number: cur + minutes } } : {}),
      ...(props.log && newLog ? { [props.log]: { rich_text:[{text:{content:newLog}}]} } : {}),
      ...(props.status ? { [props.status]: { status:{ name:isComplete?'完了':'保留'} } } : {})
    }
  });

  settings.currentRunningTask = null;
  settings.startTime = null;
  dom.thinkingLogInput.value = '';
  saveSettings();
  updateRunning(false);
  loadTasks();
}

function updateRunning(on) {
  dom.runningTaskContainer.classList.toggle('hidden', !on);
  dom.mainView.classList.toggle('hidden', on);
  if (on) {
    dom.runningTaskTitle.textContent = settings.currentRunningTask.title;
    settings.timerInterval = setInterval(()=>{
      dom.runningTimer.textContent = formatTime(Date.now()-settings.startTime);
    },1000);
  } else {
    clearInterval(settings.timerInterval);
    dom.runningTimer.textContent = '00:00:00';
  }
}

// =====================================================
// Init
// =====================================================
function init() {
  dom = getDom();
  loadSettings();

  dom.toggleSettings.onclick = () => {
    dom.mainView.classList.add('hidden');
    dom.settingsView.classList.remove('hidden');
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
    dom.settingsView.classList.add('hidden');
    dom.mainView.classList.remove('hidden');
    fetchDatabaseList().then(loadTasks);
  };

  dom.startExistingTask.onclick = () => {
    dom.startExistingTask.classList.add('active');
    dom.startNewTask.classList.remove('active');
    dom.existingTaskTab.classList.remove('hidden');
    dom.newTaskTab.classList.add('hidden');
  };

  dom.startNewTask.onclick = async () => {
    dom.startNewTask.classList.add('active');
    dom.startExistingTask.classList.remove('active');
    dom.newTaskTab.classList.remove('hidden');
    dom.existingTaskTab.classList.add('hidden');

    const props = await getDbProps(dom.taskDbFilter.value);
    dom.newCatContainer.innerHTML = props.category
      ? props.category.options.map(o=>`<label><input type="radio" name="cat" value="${o.name}">${o.name}</label>`).join('')
      : '';
    dom.newDeptContainer.innerHTML = props.department
      ? props.department.options.map(o=>`<label><input type="checkbox" value="${o.name}">${o.name}</label>`).join('')
      : '';
  };

  dom.startNewTaskButton.onclick = () => {
    const title = dom.newTaskTitle.value.trim();
    if (!title) return alert('タスク名必須');

    const cat = document.querySelector('input[name=cat]:checked')?.value;
    const depts = [...dom.newDeptContainer.querySelectorAll('input:checked')].map(x=>x.value);

    startTask({
      title,
      dbId: dom.taskDbFilter.value,
      category: cat,
      departments: depts
    });
  };

  dom.stopTaskButton.onclick = ()=>stopTask(false);
  dom.completeTaskButton.onclick = ()=>stopTask(true);
  dom.reloadTasks.onclick = loadTasks;

  if (settings.notionToken && settings.notionDatabases.length) {
    fetchDatabaseList().then(loadTasks);
    if (settings.currentRunningTask) updateRunning(true);
  } else {
    dom.toggleSettings.click();
  }
}

init();
