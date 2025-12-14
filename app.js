// =====================================================
// 定数
// =====================================================
const PROXY_URL = 'https://company-notion-toggl-api.vercel.app/api/proxy';
const NOTION_API_BASE = 'https://api.notion.com/v1';
const TOGGL_V9_BASE = 'https://api.track.toggl.com/api/v9';

const STATUS_TARGET = ['未着手', '進行中'];

// =====================================================
// 状態
// =====================================================
const state = {
  settings: {
    notionToken: '',
    notionDatabases: [],
    togglToken: '',
    togglWorkspaceId: ''
  },
  currentTask: null,
  startTime: null
};

let dom = {};

// =====================================================
// DOM取得
// =====================================================
function getDom() {
  return {
    // main
    mainView: document.getElementById('mainView'),

    // tabs
    tabExisting: document.getElementById('tabExisting'),
    tabNew: document.getElementById('tabNew'),
    existingSection: document.getElementById('existingSection'),
    newSection: document.getElementById('newSection'),

    // existing
    dbSelect: document.getElementById('dbSelect'),
    reloadBtn: document.getElementById('reloadBtn'),
    taskList: document.getElementById('taskList'),

    // new
    newTitle: document.getElementById('newTitle'),
    createBtn: document.getElementById('createBtn'),

    // settings
    openSettings: document.getElementById('openSettings')
  };
}

// =====================================================
// 初期化
// =====================================================
function init() {
  dom = getDom();
  loadSettings();
  bindUI();
  renderDbSelect();
}

document.addEventListener('DOMContentLoaded', init);

// =====================================================
// UI バインド
// =====================================================
function bindUI() {
  // タブ切替
  dom.tabExisting.onclick = () => switchTab('existing');
  dom.tabNew.onclick = () => switchTab('new');

  // 再読込
  dom.reloadBtn.onclick = loadNotionTasks;

  // 新規作成
  dom.createBtn.onclick = handleCreateTask;
}

function switchTab(type) {
  if (type === 'existing') {
    dom.tabExisting.classList.add('active');
    dom.tabNew.classList.remove('active');
    dom.existingSection.classList.remove('hidden');
    dom.newSection.classList.add('hidden');
  } else {
    dom.tabNew.classList.add('active');
    dom.tabExisting.classList.remove('active');
    dom.newSection.classList.remove('hidden');
    dom.existingSection.classList.add('hidden');
  }
}

// =====================================================
// Settings
// =====================================================
function loadSettings() {
  state.settings.notionToken = localStorage.getItem('notionToken') || '';
  state.settings.togglToken = localStorage.getItem('togglApiToken') || '';
  state.settings.togglWorkspaceId = localStorage.getItem('togglWorkspaceId') || '';

  try {
    state.settings.notionDatabases =
      JSON.parse(localStorage.getItem('notionDatabases') || '[]');
  } catch {
    state.settings.notionDatabases = [];
  }
}

// =====================================================
// Notion DB セレクト
// =====================================================
function renderDbSelect() {
  dom.dbSelect.innerHTML = '';
  state.settings.notionDatabases.forEach(db => {
    const opt = document.createElement('option');
    opt.value = db.id;
    opt.textContent = db.name;
    dom.dbSelect.appendChild(opt);
  });
}

// =====================================================
// Proxy API
// =====================================================
async function externalApi({ targetUrl, method = 'GET', tokenKey, tokenValue, body }) {
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

  return res.json();
}

// =====================================================
// Notion Tasks 読み込み
// =====================================================
async function loadNotionTasks() {
  dom.taskList.innerHTML = '読み込み中...';

  const dbId = dom.dbSelect.value;
  if (!dbId) {
    dom.taskList.innerHTML = 'DB未選択';
    return;
  }

  const data = await externalApi({
    targetUrl: `${NOTION_API_BASE}/databases/${dbId}/query`,
    method: 'POST',
    tokenKey: 'notionToken',
    tokenValue: state.settings.notionToken,
    body: {
      filter: {
        property: 'ステータス',
        status: { in: STATUS_TARGET }
      }
    }
  });

  renderTaskList(data.results);
}

function renderTaskList(tasks) {
  dom.taskList.innerHTML = '';

  if (!tasks.length) {
    dom.taskList.textContent = '対象タスクなし';
    return;
  }

  tasks.forEach(task => {
    const title =
      task.properties?.名前?.title?.[0]?.plain_text || 'untitled';

    const row = document.createElement('div');
    row.className = 'task-row';

    const label = document.createElement('span');
    label.textContent = title;

    const btn = document.createElement('button');
    btn.textContent = '開始';
    btn.className = 'btn primary';
    btn.onclick = () => startExistingTask(task, title);

    row.appendChild(label);
    row.appendChild(btn);
    dom.taskList.appendChild(row);
  });
}

// =====================================================
// 新規タスク
// =====================================================
function getSelectedCategory() {
  return document.querySelector('input[name="category"]:checked')?.value || '';
}

function getSelectedDepartments() {
  return [...document.querySelectorAll('.dept:checked')].map(el => el.value);
}

async function handleCreateTask() {
  const title = dom.newTitle.value.trim();
  const category = getSelectedCategory();
  const departments = getSelectedDepartments();

  if (!title) {
    alert('タスク名は必須です');
    return;
  }
  if (!category) {
    alert('カテゴリは必須です');
    return;
  }

  const description = buildDescription(title, category, departments);
  await startToggl(description);
}

// =====================================================
// Toggl
// =====================================================
function buildDescription(title, category, departments) {
  const tags = [
    ...departments.map(d => `【${d}】`),
    `【${category}】`
  ].join('');
  return `${tags}${title}`;
}

async function startToggl(description) {
  await externalApi({
    targetUrl: `${TOGGL_V9_BASE}/time_entries`,
    method: 'POST',
    tokenKey: 'togglApiToken',
    tokenValue: state.settings.togglToken,
    body: {
      description,
      workspace_id: Number(state.settings.togglWorkspaceId),
      start: new Date().toISOString(),
      duration: -1,
      created_with: 'Notion Toggl Timer'
    }
  });

  alert('打刻開始');
}

async function startExistingTask(task, title) {
  // ここでカテゴリ / 部門を Notion から読む想定
  const description = title;
  await startToggl(description);
}
