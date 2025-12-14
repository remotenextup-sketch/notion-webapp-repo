const PROXY_URL = 'https://company-notion-toggl-api.vercel.app/api/proxy';
const TOGGL_V9_BASE_URL = 'https://api.track.toggl.com/api/v9';

const STATUS_ACTIVE = ['未着手', '進行中'];

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

let dom = {};

// ================= DOM =================
function getDom() {
  return {
    mainView: document.getElementById('mainView'),
    settingsView: document.getElementById('settingsView'),
    toggleSettings: document.getElementById('toggleSettings'),
    cancelConfig: document.getElementById('cancelConfig'),
    saveConfig: document.getElementById('saveConfig'),
    addDbConfig: document.getElementById('addDbConfig'),
    dbConfigContainer: document.getElementById('dbConfigContainer'),

    confNotionToken: document.getElementById('confNotionToken'),
    confNotionUserId: document.getElementById('confNotionUserId'),
    confTogglToken: document.getElementById('confTogglToken'),
    confTogglWid: document.getElementById('confTogglWid'),

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

// ================= Storage =================
function loadSettings() {
  Object.assign(settings, JSON.parse(localStorage.getItem('settings') || '{}'));
}

function saveSettings() {
  localStorage.setItem('settings', JSON.stringify(settings));
}

// ================= API =================
async function externalApi(targetUrl, method, auth, body) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetUrl,
      method,
      tokenKey: auth.key,
      tokenValue: auth.value,
      notionVersion: auth.notionVersion,
      body
    })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.status === 204 ? null : res.json();
}

const notionApi = (ep, m, b) =>
  externalApi(`https://api.notion.com/v1${ep}`, m, {
    key: 'notionToken',
    value: settings.notionToken,
    notionVersion: '2022-06-28'
  }, b);

const togglApi = (url, m, b) =>
  externalApi(url, m, {
    key: 'togglApiToken',
    value: settings.togglApiToken
  }, b);

// ================= Tasks =================
async function loadTasks() {
  const dbId = dom.taskDbFilter.value;
  dom.taskListContainer.innerHTML = '読み込み中...';

  const res = await notionApi(`/databases/${dbId}/query`, 'POST', {
    filter: {
      or: STATUS_ACTIVE.map(s => ({
        property: 'ステータス',
        status: { equals: s }
      }))
    }
  });

  dom.taskListContainer.innerHTML = '';
  res.results.forEach(p => {
    const title = p.properties['名前'].title[0]?.plain_text || '無題';
    const li = document.createElement('li');
    li.style.display = 'flex';
    li.style.justifyContent = 'space-between';

    const span = document.createElement('span');
    span.textContent = title;

    const btn = document.createElement('button');
    btn.textContent = '▶ 開始';
    btn.onclick = () => startTask({
      id: p.id,
      title,
      dbId,
      properties: p.properties
    });

    li.append(span, btn);
    dom.taskListContainer.appendChild(li);
  });
}

// ================= Start / Stop =================
async function startTask(task) {
  const cat = task.properties['カテゴリ']?.select?.name;
  const depts = task.properties['部門']?.multi_select?.map(d => d.name) || [];

  const desc = `${depts.map(d => `【${d}】`).join('')}【${cat}】${task.title}`;

  const entry = await togglApi(`${TOGGL_V9_BASE_URL}/time_entries`, 'POST', {
    workspace_id: Number(settings.togglWorkspaceId),
    description: desc,
    created_with: 'Notion Toggl Timer',
    start: new Date().toISOString(),
    duration: -1
  });

  settings.currentRunningTask = { ...task, togglEntryId: entry.id };
  settings.startTime = Date.now();
  saveSettings();
  updateRunningUI(true);
}

async function stopTask(isComplete) {
  const t = settings.currentRunningTask;
  await togglApi(
    `${TOGGL_V9_BASE_URL}/workspaces/${settings.togglWorkspaceId}/time_entries/${t.togglEntryId}/stop`,
    'PATCH'
  );

  const log = dom.thinkingLogInput.value.trim();
  if (log) {
    const now = new Date().toLocaleString();
    await notionApi(`/pages/${t.id}`, 'PATCH', {
      properties: {
        思考ログ: {
          rich_text: [{
            text: { content: `\n[${now}]\n${log}` }
          }]
        }
      }
    });
  }

  settings.currentRunningTask = null;
  settings.startTime = null;
  saveSettings();
  updateRunningUI(false);
  loadTasks();
}

// ================= UI =================
function updateRunningUI(running) {
  dom.runningTaskContainer.classList.toggle('hidden', !running);
  dom.mainView.classList.toggle('hidden', running);

  if (running) {
    dom.runningTaskTitle.textContent = settings.currentRunningTask.title;
    settings.timerInterval = setInterval(() => {
      const sec = Math.floor((Date.now() - settings.startTime) / 1000);
      dom.runningTimer.textContent =
        new Date(sec * 1000).toISOString().substr(11, 8);
    }, 1000);
  } else {
    clearInterval(settings.timerInterval);
    dom.runningTimer.textContent = '00:00:00';
    dom.thinkingLogInput.value = '';
  }
}

// ================= Init =================
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
    settings.notionToken = dom.confNotionToken.value;
    settings.humanUserId = dom.confNotionUserId.value;
    settings.togglApiToken = dom.confTogglToken.value;
    settings.togglWorkspaceId = dom.confTogglWid.value;
    saveSettings();
    location.reload();
  };

  dom.reloadTasks.onclick = loadTasks;
  dom.stopTaskButton.onclick = () => stopTask(false);
  dom.completeTaskButton.onclick = () => stopTask(true);

  if (settings.currentRunningTask) updateRunningUI(true);
}

init();
