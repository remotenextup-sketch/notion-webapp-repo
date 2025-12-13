// =====================================================
// SAFETY PATCH（Toggl直叩き防止）
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

    if (url.includes('api.track.toggl.com') && !url.includes('/api/proxy')) {
      throw new Error('Direct Toggl API blocked. Use proxy.');
    }
    return originalFetch(input, init);
  };
})();

// =====================================================
// 定数
// =====================================================
const PROXY_URL = 'https://company-notion-toggl-api.vercel.app/api/proxy';
const TOGGL_V9 = 'https://api.track.toggl.com/api/v9';

// =====================================================
// 状態
// =====================================================
const settings = {
  notionToken: '',
  togglApiToken: '',
  togglWorkspaceId: '',
  notionDatabases: [],
  running: null,
  timer: null
};

let dom = null;

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
    dbConfigContainer: document.getElementById('dbConfigContainer'),
    confNotionToken: document.getElementById('confNotionToken'),
    confTogglToken: document.getElementById('confTogglToken'),
    confTogglWid: document.getElementById('confTogglWid'),
    taskDbFilter: document.getElementById('taskDbFilter'),
    taskListContainer: document.getElementById('taskListContainer'),
    reloadTasks: document.getElementById('reloadTasks'),
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
const pad = n => String(n).padStart(2, '0');
const nowStr = () => {
  const d = new Date();
  return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const elapsedMin = start => Math.ceil((Date.now() - start) / 60000);

// =====================================================
// LocalStorage
// =====================================================
function loadSettings() {
  settings.notionToken = localStorage.getItem('notionToken') || '';
  settings.togglApiToken = localStorage.getItem('togglApiToken') || '';
  settings.togglWorkspaceId = localStorage.getItem('togglWorkspaceId') || '';
  settings.notionDatabases = JSON.parse(localStorage.getItem('notionDatabases') || '[]');
}

function saveSettings() {
  localStorage.setItem('notionToken', settings.notionToken);
  localStorage.setItem('togglApiToken', settings.togglApiToken);
  localStorage.setItem('togglWorkspaceId', settings.togglWorkspaceId);
  localStorage.setItem('notionDatabases', JSON.stringify(settings.notionDatabases));
}

// =====================================================
// Proxy API
// =====================================================
async function externalApi(targetUrl, method, tokenKey, tokenValue, body) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetUrl, method, tokenKey, tokenValue, body })
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Proxy ${res.status}: ${t}`);
  }
  return res.status === 204 ? null : res.json();
}

const notionApi = (ep, m='GET', b=null) =>
  externalApi(`https://api.notion.com/v1${ep}`, m, 'notionToken', settings.notionToken, b);

const togglApi = (url, m='GET', b=null) =>
  externalApi(url, m, 'togglApiToken', settings.togglApiToken, b);

// =====================================================
// Notion Helpers
// =====================================================
function findTitleProp(props) {
  return Object.entries(props).find(([,v]) => v.type === 'title')?.[0];
}

function extractProps(props) {
  const r = {};
  for (const [k,v] of Object.entries(props)) {
    if (v.type === 'number') r.duration = k;
    if (v.type === 'select' && k.includes('カテゴリ')) r.category = k;
    if (v.type === 'multi_select') r.department = k;
    if (v.type === 'rich_text' && k.includes('思考')) r.thinking = k;
    if (v.type === 'select' && k === 'Status') r.status = k;
  }
  return r;
}

// =====================================================
// Tasks
// =====================================================
async function loadTasks() {
  dom.taskListContainer.innerHTML = '';
  const dbId = dom.taskDbFilter.value;
  if (!dbId) return;

  const res = await notionApi(`/databases/${dbId}/query`, 'POST', {
    filter: {
      or: [
        { property: 'Status', select: { equals: '未着手' } },
        { property: 'Status', select: { equals: '進行中' } }
      ]
    }
  });

  const props = extractProps(res.results[0]?.properties || {});
  const titleProp = findTitleProp(res.results[0]?.properties || {});

  res.results.forEach(page => {
    const title = page.properties[titleProp]?.title?.[0]?.plain_text || '(無題)';
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';

    const btn = document.createElement('button');
    btn.textContent = '開始';
    btn.className = 'btn btn-green';
    btn.onclick = () => startTask(page, title, props);

    row.innerHTML = `<span>${title}</span>`;
    row.appendChild(btn);
    dom.taskListContainer.appendChild(row);
  });
}

// =====================================================
// Toggl Start / Stop
// =====================================================
async function startTask(page, title, props) {
  const category = props.category && page.properties[props.category]?.select?.name;
  const depts = props.department
    ? page.properties[props.department]?.multi_select.map(d=>d.name)
    : [];

  // 部門を【】で個別に囲う
const deptLabel = depts.map(d => `【${d}】`).join('');

// カテゴリ（あれば）
const categoryLabel = category ? `【${category}】` : '';

// Toggl description
const desc = `${deptLabel}${categoryLabel}${title}`;


  const tags = [...depts, category].filter(Boolean);

  const te = await togglApi(`${TOGGL_V9}/time_entries`, 'POST', {
    workspace_id: Number(settings.togglWorkspaceId),
    description: desc,
    start: new Date().toISOString(),
    duration: -1,
    tags,
    created_with: 'NotionTogglTimer'
  });

  settings.running = {
    page,
    props,
    togglId: te.id,
    start: Date.now()
  };

  dom.runningTaskTitle.textContent = title;
  dom.runningTaskContainer.classList.remove('hidden');

  settings.timer = setInterval(() => {
    const ms = Date.now() - settings.running.start;
    const s = Math.floor(ms/1000);
    dom.runningTimer.textContent =
      `${pad(Math.floor(s/3600))}:${pad(Math.floor(s%3600/60))}:${pad(s%60)}`;
  }, 1000);
}

async function stopTask(complete=false) {
  if (!settings.running) return;
  await togglApi(`${TOGGL_V9}/workspaces/${settings.togglWorkspaceId}/time_entries/${settings.running.togglId}/stop`, 'PATCH');

  const { page, props, start } = settings.running;
  const updates = {};

  if (props.duration) {
    const cur = page.properties[props.duration]?.number || 0;
    updates[props.duration] = { number: cur + elapsedMin(start) };
  }

  if (props.thinking) {
    const old = page.properties[props.thinking]?.rich_text?.[0]?.plain_text || '';
    const add = dom.thinkingLogInput.value.trim();
    if (add) {
      updates[props.thinking] = {
        rich_text: [{ text: { content: `${nowStr()} ${add}\n${old}` }}]
      };
    }
  }

  if (complete && props.status) {
    updates[props.status] = { select: { name: '完了' } };
  }

  if (Object.keys(updates).length) {
    await notionApi(`/pages/${page.id}`, 'PATCH', { properties: updates });
  }

  clearInterval(settings.timer);
  dom.thinkingLogInput.value = '';
  dom.runningTaskContainer.classList.add('hidden');
  settings.running = null;
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

  dom.reloadTasks.onclick = loadTasks;
  dom.stopTaskButton.onclick = () => stopTask(false);
  dom.completeTaskButton.onclick = () => stopTask(true);

  console.log('✅ init 完了');
}

init();
