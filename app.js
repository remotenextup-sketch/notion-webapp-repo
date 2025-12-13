// ===============================
// 状態
// ===============================
const settings = {
  notionToken: '',
  humanUserId: '',
  notionDatabases: []
};

let dom = null;

// ===============================
// DOM取得
// ===============================
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
    taskListContainer: document.getElementById('taskListContainer')
  };
}

// ===============================
// Storage
// ===============================
function loadSettings() {
  settings.notionToken = localStorage.getItem('notionToken') || '';
  settings.humanUserId = localStorage.getItem('humanUserId') || '';
  try {
    settings.notionDatabases = JSON.parse(localStorage.getItem('notionDatabases') || '[]');
  } catch {
    settings.notionDatabases = [];
  }
}

function saveSettings() {
  localStorage.setItem('notionToken', settings.notionToken);
  localStorage.setItem('humanUserId', settings.humanUserId);
  localStorage.setItem('notionDatabases', JSON.stringify(settings.notionDatabases));
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

function showSettings() {
  dom.confNotionToken.value = settings.notionToken;
  dom.confNotionUserId.value = settings.humanUserId;
  renderDbConfigForms();

  dom.settingsView.classList.remove('hidden');
  dom.mainView.classList.add('hidden');
}

function hideSettings() {
  dom.settingsView.classList.add('hidden');
  dom.mainView.classList.remove('hidden');
}

function handleSaveSettings() {
  settings.notionToken = dom.confNotionToken.value.trim();
  settings.humanUserId = dom.confNotionUserId.value.trim();

  const names = document.querySelectorAll('.db-name');
  const ids = document.querySelectorAll('.db-id');

  const dbs = [];
  names.forEach((n, i) => {
    if (n.value && ids[i].value) {
      dbs.push({ name: n.value, id: ids[i].value });
    }
  });

  settings.notionDatabases = dbs;
  saveSettings();
  hideSettings();
  renderDbSelect();
}

// ===============================
// Task表示（ダミー）
// ===============================
function renderDbSelect() {
  dom.taskDbFilter.innerHTML = '';

  settings.notionDatabases.forEach(db => {
    const opt = document.createElement('option');
    opt.value = db.id;
    opt.textContent = db.name;
    dom.taskDbFilter.appendChild(opt);
  });
}

function loadTasks() {
  dom.taskListContainer.innerHTML = '<li>（ここにNotionタスクが表示されます）</li>';
}

// ===============================
// Init
// ===============================
function init() {
  dom = getDomElements();
  loadSettings();
  renderDbSelect();

  dom.toggleSettingsButton.onclick = showSettings;
  dom.cancelConfigButton.onclick = hideSettings;
  dom.saveConfigButton.onclick = handleSaveSettings;
  dom.addDbConfigButton.onclick = handleAddDbConfig;
  dom.reloadTasksButton.onclick = loadTasks;

  console.log('✅ init完了', dom);
}

init();
