// =====================================================
// 定数
// =====================================================
const PROXY_URL = 'https://company-notion-toggl-api.vercel.app/api/proxy';
const TOGGL_BASE = 'https://api.track.toggl.com/api/v9';

const STATUS_ACTIVE = ['未着手', '進行中'];

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

const dbPropsCache = {};
let dom = null;

// =====================================================
// Utility
// =====================================================
const qs = s => document.querySelector(s);
const qsa = s => [...document.querySelectorAll(s)];

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}`;
}

function notify(msg, ms = 2500) {
  let el = qs('#appNotification');
  if (!el) {
    el = document.createElement('div');
    el.id = 'appNotification';
    el.style.cssText = `
      position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
      background:#4caf50;color:#fff;padding:10px 16px;
      border-radius:6px;z-index:9999;font-size:14px;
    `;
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => el.style.opacity = '0', ms);
}

// =====================================================
// DOM
// =====================================================
function getDom() {
  return {
    mainView: qs('#mainView'),
    settingsView: qs('#settingsView'),

    toggleSettings: qs('#toggleSettings'),
    cancelConfig: qs('#cancelConfig'),
    saveConfig: qs('#saveConfig'),
    addDbConfig: qs('#addDbConfig'),

    confNotionToken: qs('#confNotionToken'),
    confNotionUserId: qs('#confNotionUserId'),
    confTogglToken: qs('#confTogglToken'),
    confTogglWid: qs('#confTogglWid'),

    dbConfigContainer: qs('#dbConfigContainer'),

    taskDbFilter: qs('#taskDbFilter'),
    reloadTasks: qs('#reloadTasks'),
    taskListContainer: qs('#taskListContainer'),

    startExistingTask: qs('#startExistingTask'),
    startNewTask: qs('#startNewTask'),
    existingTaskTab: qs('#existingTaskTab'),
    newTaskTab: qs('#newTaskTab'),

    newTaskTitle: qs('#newTaskTitle'),
    newCatContainer: qs('#newCatContainer'),
    newDeptContainer: qs('#newDeptContainer'),
    startNewTaskButton: qs('#startNewTaskButton'),

    runningTaskContainer: qs('#runningTaskContainer'),
    runningTaskTitle: qs('#runningTaskTitle'),
    runningTimer: qs('#runningTimer'),
    thinkingLogInput: qs('#thinkingLogInput'),
    stopTaskButton: qs('#stopTaskButton'),
    completeTaskButton: qs('#completeTaskButton')
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
async function proxyApi(targetUrl, method, tokenKey, tokenValue, body) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
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

const notionApi = (path, method='GET', body=null) =>
  proxyApi(`https://api.notion.com/v1${path}`, method,
    'notionToken', settings.notionToken, body);

const togglApi = (url, method='GET', body=null) =>
  proxyApi(url, method, 'togglApiToken', settings.togglApiToken, body);

// =====================================================
// Notion DB / Tasks
// =====================================================
async function fetchDatabaseList() {
  settings.databases = [];
  for (const d of settings.notionDatabases) {
    const res = await notionApi(`/databases/${d.id.replace(/-/g,'')}`);
    settings.databases.push({ id: res.id, name: d.name });
  }
  dom.taskDbFilter.innerHTML =
    settings.databases.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
}

async function getDbProps(dbId) {
  if (dbPropsCache[dbId]) return dbPropsCache[dbId];
  const res = await notionApi(`/databases/${dbId}`);
  const p = res.properties;
  const m = {};

  for (const k in p) {
    if (p[k].type === 'title') m.title = k;
    if (p[k].type === 'status') m.status = k;
    if (p[k].type === 'select' && (k.includes('カテゴリ') || k.includes('種別'))) {
      m.category = { name: k, options: p[k].select.options };
    }
    if (p[k].type === 'multi_select' && k.includes('部門')) {
      m.department = { name: k, options: p[k].multi_select.options };
    }
    if (p[k].type === 'rich_text' && k.includes('思考')) m.log = k;
    if (p[k].type === 'number' && k.includes('計測')) m.duration = k;
  }
  dbPropsCache[dbId] = m;
  return m;
}

async function loadTasks() {
  const dbId = dom.taskDbFilter.value;
  dom.taskListContainer.innerHTML = '読み込み中…';

  const props = await getDbProps(dbId);
  const res = await notionApi(`/databases/${dbId}/query`, 'POST', {
    filter: {
      and: [{
        property: props.status,
        status: { is_not_empty: true }
      }]
    }
  });

  const tasks = res.results.filter(t => {
    const s = t.properties[props.status]?.status?.name;
    const title = t.properties[props.title]?.title?.[0]?.plain_text;
    return STATUS_ACTIVE.includes(s) && title;
  });

  renderTaskList(tasks, props);
}

function renderTaskList(tasks, props) {
  dom.taskListContainer.innerHTML = '';
  if (!tasks.length) {
    dom.taskListContainer.textContent = 'タスクなし';
    return;
  }

  const ul = document.createElement('ul');
  ul.className = 'task-list';

  tasks.forEach(t => {
    const title = t.properties[props.title].title[0].plain_text;
    const li = document.createElement('li');
    li.innerHTML = `<span>${title}</span>`;
    const btn = document.createElement('button');
    btn.textContent = '▶ 開始';
    btn.onclick = () => startTask(t, props);
    li.appendChild(btn);
    ul.appendChild(li);
  });
  dom.taskListContainer.appendChild(ul);
}

// =====================================================
// Toggl Start / Stop
// =====================================================
async function startTask(task, props) {
  if (settings.currentRunningTask) return alert('実行中あり');

  const title = task.properties[props.title].title[0].plain_text;
  const cat = props.category ? task.properties[props.category.name]?.select?.name : '';
  const depts = props.department
    ? task.properties[props.department.name]?.multi_select?.map(d=>d.name) : [];

  const desc = `${depts.map(d=>`【${d}】`).join('')}${cat?`【${cat}】`:''}${title}`;

  const entry = await togglApi(`${TOGGL_BASE}/time_entries`, 'POST', {
    workspace_id: Number(settings.togglWorkspaceId),
    description: desc,
    created_with: 'Notion-Toggl-Timer',
    start: new Date().toISOString(),
    duration: -1,
    tags: [...depts, cat].filter(Boolean)
  });

  settings.currentRunningTask = {
    id: task.id,
    dbId: dom.taskDbFilter.value,
    title,
    togglId: entry.id,
    props
  };
  settings.startTime = Date.now();
  saveSettings();
  updateRunningUI(true);
}

async function stopTask(isComplete) {
  const t = settings.currentRunningTask;
  await togglApi(`${TOGGL_BASE}/workspaces/${settings.togglWorkspaceId}/time_entries/${t.togglId}/stop`, 'PATCH');

  const props = t.props;
  const page = await notionApi(`/pages/${t.id}`);
  const patch = { properties: {} };

  if (props.duration) {
    const cur = page.properties[props.duration]?.number || 0;
    patch.properties[props.duration] = { number: cur + Math.round((Date.now()-settings.startTime)/60000) };
  }

  if (props.log && dom.thinkingLogInput.value) {
    const now = new Date().toLocaleString();
    const prev = page.properties[props.log]?.rich_text?.[0]?.plain_text || '';
    patch.properties[props.log] = {
      rich_text: [{ text: { content: `${prev}\n\n[${now}]\n${dom.thinkingLogInput.value}` }}]
    };
  }

  await notionApi(`/pages/${t.id}`, 'PATCH', patch);

  settings.currentRunningTask = null;
  settings.startTime = null;
  dom.thinkingLogInput.value = '';
  saveSettings();
  updateRunningUI(false);
  loadTasks();
}

// =====================================================
// UI
// =====================================================
function updateRunningUI(on) {
  if (on) {
    dom.runningTaskContainer.classList.remove('hidden');
    dom.runningTaskTitle.textContent = settings.currentRunningTask.title;
    dom.mainView.classList.add('hidden');
    settings.timerInterval = setInterval(() => {
      dom.runningTimer.textContent = formatTime(Date.now()-settings.startTime);
    }, 1000);
  } else {
    clearInterval(settings.timerInterval);
    dom.runningTaskContainer.classList.add('hidden');
    dom.mainView.classList.remove('hidden');
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

    const names = qsa('.db-name');
    const ids = qsa('.db-id');
    settings.notionDatabases = [];
    names.forEach((n,i)=>{
      if(n.value && ids[i].value){
        settings.notionDatabases.push({name:n.value,id:ids[i].value});
      }
    });
    saveSettings();
    dom.settingsView.classList.add('hidden');
    dom.mainView.classList.remove('hidden');
    fetchDatabaseList().then(loadTasks);
  };

  dom.stopTaskButton.onclick = () => stopTask(false);
  dom.completeTaskButton.onclick = () => stopTask(true);
  dom.reloadTasks.onclick = loadTasks;

  if (settings.notionToken && settings.notionDatabases.length) {
    fetchDatabaseList().then(loadTasks);
  } else {
    dom.toggleSettings.click();
  }

  if (settings.currentRunningTask) updateRunningUI(true);

  console.log('✅ init 完了');
}

init();
