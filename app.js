const PROXY_URL = 'https://company-notion-toggl-api.vercel.app/api/proxy';

let dom = null;

const settings = {
  notionToken: '',
  notionDatabases: []
};

// ---------------- DOM ----------------
function getDomElements() {
  return {
    mainView: document.getElementById('mainView'),
    settingsView: document.getElementById('settingsView'),

    toggleSettingsButton: document.getElementById('toggleSettings'),
    cancelConfigButton: document.getElementById('cancelConfig'),
    saveConfigButton: document.getElementById('saveConfig'),

    confNotionToken: document.getElementById('confNotionToken'),
    confNotionUserId: document.getElementById('confNotionUserId'),

    dbConfigContainer: document.getElementById('dbConfigContainer'),
    addDbConfigButton: document.getElementById('addDbConfig'),

    taskDbFilter: document.getElementById('taskDbFilter'),
    reloadTasksButton: document.getElementById('reloadTasks'),
    taskListContainer: document.getElementById('taskListContainer'),

    startExistingTask: document.getElementById('startExistingTask'),
    startNewTask: document.getElementById('startNewTask'),
    existingTaskTab: document.getElementById('existingTaskTab'),
    newTaskTab: document.getElementById('newTaskTab'),

    newTaskTitle: document.getElementById('newTaskTitle'),
    startNewTaskButton: document.getElementById('startNewTaskButton')
  };
}

// ---------------- Settings ----------------
function loadSettings() {
  settings.notionToken = localStorage.getItem('notionToken') || '';
  try {
    settings.notionDatabases = JSON.parse(localStorage.getItem('notionDatabases') || '[]');
  } catch {
    settings.notionDatabases = [];
  }
}

function saveSettings() {
  localStorage.setItem('notionToken', settings.notionToken);
  localStorage.setItem('notionDatabases', JSON.stringify(settings.notionDatabases));
}

// ---------------- UI ----------------
function showSettings() {
  dom.confNotionToken.value = settings.notionToken;
  dom.settingsView.classList.remove('hidden');
  dom.mainView.classList.add('hidden');
  renderDbConfigForms();
}

function hideSettings() {
  dom.settingsView.classList.add('hidden');
  dom.mainView.classList.remove('hidden');
  renderDbSelect();
  loadTasks();
}

// ---------------- DB Config ----------------
function renderDbConfigForms() {
  dom.dbConfigContainer.innerHTML = '';

  if (settings.notionDatabases.length === 0) {
    settings.notionDatabases.push({ name: '', id: '' });
  }

  settings.notionDatabases.forEach((db, i) => {
    const row = document.createElement('div');
    row.innerHTML = `
      <input class="input-field db-name" data-i="${i}" placeholder="表示名" value="${db.name}">
      <input class="input-field db-id" data-i="${i}" placeholder="Database ID" value="${db.id}">
    `;
    dom.dbConfigContainer.appendChild(row);
  });
}

function handleAddDbConfig() {
  settings.notionDatabases.push({ name: '', id: '' });
  renderDbConfigForms();
}

// ---------------- Notion API ----------------
async function notionApi(endpoint, method = 'GET', body = null) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetUrl: `https://api.notion.com/v1${endpoint}`,
      method,
      tokenKey: 'notionToken',
      tokenValue: settings.notionToken,
      notionVersion: '2022-06-28',
      body
    })
  });

  if (!res.ok) throw new Error('Notion API error');
  return res.json();
}

// ---------------- Tasks ----------------
function renderDbSelect() {
  dom.taskDbFilter.innerHTML = '';
  settings.notionDatabases.forEach(db => {
    const opt = document.createElement('option');
    opt.value = db.id;
    opt.textContent = db.name;
    dom.taskDbFilter.appendChild(opt);
  });
}

async function loadTasks() {
  dom.taskListContainer.innerHTML = '<p>読み込み中...</p>';

  const dbId = dom.taskDbFilter.value;
  if (!dbId) return;

  const res = await notionApi(`/databases/${dbId}/query`, 'POST', {});
  const ul = document.createElement('ul');
  ul.className = 'task-list';

  res.results.forEach(page => {
    const titleProp = Object.values(page.properties).find(p => p.type === 'title');
    const title = titleProp?.title?.[0]?.plain_text || '無題';

    const li = document.createElement('li');
    li.textContent = title;
    ul.appendChild(li);
  });

  dom.taskListContainer.innerHTML = '';
  dom.taskListContainer.appendChild(ul);
}

// ---------------- Init ----------------
function init() {
  dom = getDomElements();
  loadSettings();
  renderDbSelect();
  loadTasks();

  dom.toggleSettingsButton.onclick = showSettings;
  dom.cancelConfigButton.onclick = hideSettings;
  dom.addDbConfigButton.onclick = handleAddDbConfig;

  dom.saveConfigButton.onclick = () => {
    settings.notionToken = dom.confNotionToken.value.trim();

    const names = document.querySelectorAll('.db-name');
    const ids = document.querySelectorAll('.db-id');
    settings.notionDatabases = [];

    names.forEach((n, i) => {
      if (n.value && ids[i].value) {
        settings.notionDatabases.push({ name: n.value, id: ids[i].value });
      }
    });

    saveSettings();
    hideSettings();
  };

  dom.reloadTasksButton.onclick = loadTasks;

  console.log('✅ init完了', dom);
}

init();
