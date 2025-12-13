console.log('🔥 APP.JS PROXY BUILD 2025-12-13 FULL');

// =====================================================
// 🔒 SAFETY PATCH: Toggl直叩き完全防止 & Proxy可視化
// =====================================================
(() => {
  const originalFetch = window.fetch;
  window.fetch = function (input, init = {}) {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof Request
        ? input.url
        : '';

    // Toggl直叩きブロック（必須）
    if (url.includes('api.track.toggl.com')) {
      console.error('🚨 BLOCKED: Direct Toggl API call detected', url);
      throw new Error('Direct Toggl API call blocked. Use proxy.');
    }

    // Proxy可視化（デバッグ）
    if (url.includes('/api/proxy')) {
      console.log('🟢 Proxy fetch:', init?.method || 'POST', url);
    }

    return originalFetch(input, init);
  };
})();

// =====================================================
// 定数・設定
// =====================================================
const PROXY_URL = '/api/proxy';
const TOGGL_V9_BASE_URL = 'https://api.track.toggl.com/api/v9';

const STATUS_INCOMPLETE = ['未着手', '進行中'];
const STATUS_RUNNING = '進行中';
const STATUS_COMPLETE = '完了';
const STATUS_PAUSE = '保留';

// Notionのプロパティ名候補（あなたのDBが多少違っても吸収する用）
const TITLE_CANDIDATES = ['Name', '名前', 'タイトル', 'タスク名', 'Title'];
const STATUS_CANDIDATES = ['ステータス', 'Status', '状態'];
const CATEGORY_CANDIDATES = ['カテゴリ', 'Category'];
const DEPT_CANDIDATES = ['部門', '部署', 'Department'];
const ASSIGNEE_CANDIDATES = ['担当者', 'Assignee', '担当', 'オーナー'];
const LOG_CANDIDATES = ['思考ログ', 'ログ', 'メモ', 'log', 'note'];
const DURATION_CANDIDATES = ['計測時間', '作業時間', 'Duration', 'Time'];
const COMPLETION_DATE_CANDIDATES = ['完了日', '完了日時', 'Completion', 'Done date'];

const settings = {
  notionToken: '',
  notionDatabases: [], // [{ name, id }, ...]
  humanUserId: '',

  togglApiToken: '',
  togglWorkspaceId: '',

  databases: [], // [{id,name}]
  currentRunningTask: null,
  startTime: null,
  timerInterval: null
};

const dbPropertiesCache = {};
let dom = null;

// =====================================================
// Utility
// =====================================================
function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function showNotification(message, duration = 2500) {
  let n = document.getElementById('appNotification');
  if (!n) {
    n = document.createElement('div');
    n.id = 'appNotification';
    n.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #4CAF50;
      color: #fff;
      padding: 10px 18px;
      border-radius: 8px;
      z-index: 9999;
      opacity: 0;
      transition: opacity .25s;
      font-size: 14px;
      box-shadow: 0 10px 18px rgba(0,0,0,.18);
      max-width: 80vw;
      white-space: pre-wrap;
    `;
    document.body.appendChild(n);
  }
  n.textContent = message;
  n.style.opacity = '1';
  clearTimeout(n._timer);
  n._timer = setTimeout(() => (n.style.opacity = '0'), duration);
}

function clearElement(el) {
  if (el) el.innerHTML = '';
}

function normalizeDbId(id) {
  return String(id || '').replace(/-/g, '').trim();
}

function isFilled(str) {
  return !!String(str || '').trim();
}

// =====================================================
// DOM取得（あなたのHTML IDに合わせてる）
// =====================================================
function getDomElements() {
  return {
    mainView: document.getElementById('mainView'),
    settingsView: document.getElementById('settingsView'),

    confNotionToken: document.getElementById('confNotionToken'),
    confNotionUserId: document.getElementById('confNotionUserId'),
    confTogglToken: document.getElementById('confTogglToken'),
    confTogglWid: document.getElementById('confTogglWid'),

    dbConfigContainer: document.getElementById('dbConfigContainer'),
    addDbConfigButton: document.getElementById('addDbConfig'),

    saveConfigButton: document.getElementById('saveConfig'),
    toggleSettingsButton: document.getElementById('toggleSettings'),
    cancelConfigButton: document.getElementById('cancelConfig'),

    taskDbFilter: document.getElementById('taskDbFilter'),
    taskListContainer: document.getElementById('taskListContainer'),
    reloadTasksButton: document.getElementById('reloadTasks'),

    runningTaskContainer: document.getElementById('runningTaskContainer'),
    runningTaskTitle: document.getElementById('runningTaskTitle'),
    runningTimer: document.getElementById('runningTimer'),
    thinkingLogInput: document.getElementById('thinkingLogInput'),

    stopTaskButton: document.getElementById('stopTaskButton'),
    completeTaskButton: document.getElementById('completeTaskButton'),

    newTaskForm: document.getElementById('newTaskForm'),
    newTaskTitle: document.getElementById('newTaskTitle'),
    newCatContainer: document.getElementById('newCatContainer'),
    newDeptContainer: document.getElementById('newDeptContainer'),
    targetDbDisplay: document.getElementById('targetDbDisplay'),
    startNewTaskButton: document.getElementById('startNewTaskButton'),

    startExistingTask: document.getElementById('startExistingTask'),
    startNewTask: document.getElementById('startNewTask'),
    existingTaskTab: document.getElementById('existingTaskTab'),
    newTaskTab: document.getElementById('newTaskTab'),
    taskSelectionSection: document.getElementById('taskSelectionSection'),

    toggleKpiReportBtn: document.getElementById('toggleKpiReportBtn'),
    kpiReportTab: document.getElementById('kpiReportTab'),
    reportPeriodSelect: document.getElementById('reportPeriodSelect'),
    fetchKpiButton: document.getElementById('fetchKpiButton'),
    reportTotalTime: document.getElementById('reportTotalTime'),
    kpiResultsContainer: document.getElementById('kpiResultsContainer')
  };
}

// =====================================================
// Settings（LocalStorage）
// =====================================================
function loadSettings() {
  settings.notionToken = localStorage.getItem('notionToken') || '';
  settings.humanUserId = localStorage.getItem('humanUserId') || '';
  settings.togglApiToken = localStorage.getItem('togglApiToken') || '';
  settings.togglWorkspaceId = localStorage.getItem('togglWorkspaceId') || '';

  try {
    const parsed = JSON.parse(localStorage.getItem('notionDatabases') || '[]');
    settings.notionDatabases = Array.isArray(parsed) ? parsed : [];
  } catch {
    settings.notionDatabases = [];
  }

  // 実行中復元
  try {
    const running = JSON.parse(localStorage.getItem('runningTask') || 'null');
    if (running && running.task && running.startTime) {
      settings.currentRunningTask = running.task;
      settings.startTime = running.startTime;
    }
  } catch {
    // ignore
  }
}

function saveSettings() {
  localStorage.setItem('notionToken', settings.notionToken);
  localStorage.setItem('humanUserId', settings.humanUserId);
  localStorage.setItem('togglApiToken', settings.togglApiToken);
  localStorage.setItem('togglWorkspaceId', settings.togglWorkspaceId);
  localStorage.setItem('notionDatabases', JSON.stringify(settings.notionDatabases));

  if (settings.currentRunningTask && settings.startTime) {
    localStorage.setItem(
      'runningTask',
      JSON.stringify({ task: settings.currentRunningTask, startTime: settings.startTime })
    );
  } else {
    localStorage.removeItem('runningTask');
  }
}

// =====================================================
// 🔧 DB設定フォーム
// =====================================================
function renderDbConfigForms() {
  if (!dom?.dbConfigContainer) return;
  clearElement(dom.dbConfigContainer);

  if (!Array.isArray(settings.notionDatabases) || settings.notionDatabases.length === 0) {
    settings.notionDatabases = [{ name: '', id: '' }];
  }

  settings.notionDatabases.forEach((db, i) => {
    const row = document.createElement('div');
    row.style.marginBottom = '8px';
    row.innerHTML = `
      <input class="db-name-input" data-i="${i}" placeholder="表示名 (例: タスクDB)" value="${db.name || ''}">
      <input class="db-id-input" data-i="${i}" placeholder="データベースID" value="${db.id || ''}">
    `;
    dom.dbConfigContainer.appendChild(row);
  });
}

function handleAddDbConfig() {
  settings.notionDatabases.push({ name: '', id: '' });
  renderDbConfigForms();
}

function showSettings() {
  if (dom?.confNotionToken) dom.confNotionToken.value = settings.notionToken || '';
  if (dom?.confNotionUserId) dom.confNotionUserId.value = settings.humanUserId || '';
  if (dom?.confTogglToken) dom.confTogglToken.value = settings.togglApiToken || '';
  if (dom?.confTogglWid) dom.confTogglWid.value = settings.togglWorkspaceId || '';

  renderDbConfigForms();

  dom?.settingsView?.classList.remove('hidden');
  dom?.mainView?.classList.add('hidden');
}

function hideSettings() {
  dom?.settingsView?.classList.add('hidden');
  dom?.mainView?.classList.remove('hidden');
}

async function handleSaveSettings() {
  settings.notionToken = dom?.confNotionToken?.value?.trim() || '';
  settings.humanUserId = dom?.confNotionUserId?.value?.trim() || '';
  settings.togglApiToken = dom?.confTogglToken?.value?.trim() || '';
  settings.togglWorkspaceId = dom?.confTogglWid?.value?.trim() || '';

  const names = Array.from(document.querySelectorAll('.db-name-input'));
  const ids = Array.from(document.querySelectorAll('.db-id-input'));

  const newDb = [];
  names.forEach((n, i) => {
    const name = (n?.value || '').trim();
    const id = (ids[i]?.value || '').trim();
    if (name && id) newDb.push({ name, id });
  });

  settings.notionDatabases = newDb;

  if (settings.notionDatabases.length === 0) {
    alert('データベース設定が一つも入力されていません。');
    return;
  }

  saveSettings();
  showNotification('設定を保存しました');
  hideSettings();

  // DBリスト再取得 → タスクロード
  try {
    await fetchDatabaseList();
    await loadTasks();
    checkRunningState();
  } catch (e) {
    console.error(e);
    showNotification(`設定後の再読み込みでエラー: ${e.message}`, 5000);
  }
}

// =====================================================
// Proxy API（Notion/Toggl共通）
// =====================================================
async function externalApi(targetUrl, method, auth, body = null) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetUrl,
      method,
      tokenKey: auth.tokenKey,
      tokenValue: auth.tokenValue,
      notionVersion: auth.notionVersion,
      body
    })
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({ message: 'Proxy Error' }));
    console.error('Proxy/API Error:', e);
    throw new Error(`API Error (${res.status}): ${e.message || 'Proxy Error'}`);
  }

  return res.status === 204 ? null : res.json();
}

function notionApi(endpoint, method = 'GET', body = null) {
  if (!settings.notionToken) throw new Error('Notion token missing');
  return externalApi(
    `https://api.notion.com/v1${endpoint}`,
    method,
    {
      tokenKey: 'notionToken',
      tokenValue: settings.notionToken,
      notionVersion: '2022-06-28'
    },
    body
  );
}

function externalTogglApi(url, method = 'GET', body = null) {
  if (!settings.togglApiToken) throw new Error('Toggl token missing');
  return externalApi(
    url,
    method,
    {
      tokenKey: 'togglApiToken',
      tokenValue: settings.togglApiToken,
      notionVersion: '2022-06-28'
    },
    body
  );
}

// =====================================================
// Notion DB: properties キャッシュ
// =====================================================
function pickByCandidates(propName, candidates) {
  const n = String(propName || '');
  return candidates.some(c => n === c || n.includes(c));
}

function findFirstPropByType(props, type) {
  const entries = Object.entries(props || {});
  for (const [name, p] of entries) {
    if (p?.type === type) return { name, prop: p };
  }
  return null;
}

function findPropByCandidates(props, candidates, allowedTypes = null) {
  const entries = Object.entries(props || {});
  for (const [name, p] of entries) {
    if (pickByCandidates(name, candidates)) {
      if (!allowedTypes || allowedTypes.includes(p.type)) return { name, prop: p };
    }
  }
  return null;
}

async function getDbProperties(dbId) {
  if (!dbId) return null;
  if (dbPropertiesCache[dbId]) return dbPropertiesCache[dbId];

  const res = await notionApi(`/databases/${dbId}`, 'GET');
  const props = res?.properties || {};

  // title
  let title = findFirstPropByType(props, 'title');
  if (!title) title = findPropByCandidates(props, TITLE_CANDIDATES, ['title']);

  // status（Notionのstatus or select どっちでも吸収）
  let status = findPropByCandidates(props, STATUS_CANDIDATES, ['status', 'select']);
  if (!status) {
    // typeから拾う（最初に見つかったstatus）
    const byType = findFirstPropByType(props, 'status');
    if (byType) status = byType;
  }

  // category: select
  let category = findPropByCandidates(props, CATEGORY_CANDIDATES, ['select']);

  // department: multi_select
  let department = findPropByCandidates(props, DEPT_CANDIDATES, ['multi_select']);

  // assignee: people
  let assignee = findPropByCandidates(props, ASSIGNEE_CANDIDATES, ['people']);

  // log: rich_text（relationは今回は使わないけど拡張余地）
  let logRichText = findPropByCandidates(props, LOG_CANDIDATES, ['rich_text']);

  // duration: number
  let durationNumber = findPropByCandidates(props, DURATION_CANDIDATES, ['number']);

  // completion date: date
  let completionDate = findPropByCandidates(props, COMPLETION_DATE_CANDIDATES, ['date']);

  const propertyMap = {
    title: title ? { name: title.name, type: 'title' } : null,
    status: status
      ? {
          name: status.name,
          type: status.prop.type,
          options:
            status.prop.type === 'status'
              ? (status.prop.status?.options || [])
              : (status.prop.select?.options || [])
        }
      : null,
    category: category
      ? {
          name: category.name,
          type: 'select',
          options: category.prop.select?.options || []
        }
      : null,
    department: department
      ? {
          name: department.name,
          type: 'multi_select',
          options: department.prop.multi_select?.options || []
        }
      : null,
    assignee: assignee ? { name: assignee.name, type: 'people' } : null,
    logRichText: logRichText ? { name: logRichText.name, type: 'rich_text' } : null,
    durationNumber: durationNumber ? { name: durationNumber.name, type: 'number' } : null,
    completionDate: completionDate ? { name: completionDate.name, type: 'date' } : null
  };

  dbPropertiesCache[dbId] = propertyMap;
  return propertyMap;
}

// =====================================================
// DB一覧取得 → フィルタに反映
// =====================================================
async function fetchDatabaseList() {
  if (!Array.isArray(settings.notionDatabases) || settings.notionDatabases.length === 0) {
    settings.databases = [];
    if (dom?.taskDbFilter) dom.taskDbFilter.innerHTML = '<option value="">DBが設定されていません</option>';
    return;
  }

  const fetched = [];

  for (const cfg of settings.notionDatabases) {
    const rawId = cfg?.id;
    const name = cfg?.name || '(no name)';
    const dbId = normalizeDbId(rawId);

    if (!dbId) continue;

    try {
      const res = await notionApi(`/databases/${dbId}`, 'GET');
      fetched.push({ id: res.id, name });
    } catch (e) {
      console.warn(`⚠️ DB取得失敗: ${name} (${rawId})`, e);
    }
  }

  settings.databases = fetched;
  saveSettings();

  if (dom?.taskDbFilter) {
    if (fetched.length === 0) {
      dom.taskDbFilter.innerHTML = '<option value="">有効なDBが見つかりません</option>';
      return;
    }

    const current = dom.taskDbFilter.value || fetched[0].id;
    dom.taskDbFilter.innerHTML = fetched
      .map(db => `<option value="${db.id}" ${db.id === current ? 'selected' : ''}>${db.name}</option>`)
      .join('');
  }
}

// =====================================================
// タスク一覧（未着手 or 進行中）
// =====================================================
function buildStatusFilter(props) {
  if (!props?.status?.name) return null;

  const propName = props.status.name;
  const type = props.status.type; // 'status' or 'select'

  if (type === 'status') {
    return {
      or: STATUS_INCOMPLETE.map(s => ({
        property: propName,
        status: { equals: s }
      }))
    };
  }

  // select
  return {
    or: STATUS_INCOMPLETE.map(s => ({
      property: propName,
      select: { equals: s }
    }))
  };
}

function getPageTitle(page, titlePropName) {
  try {
    const arr = page?.properties?.[titlePropName]?.title || [];
    const t = arr.map(x => x?.plain_text || '').join('').trim();
    return t || '無題';
  } catch {
    return '無題';
  }
}

async function loadTasks() {
  const dbId = dom?.taskDbFilter?.value || null;
  if (!dbId || !dom?.taskListContainer) {
    if (dom?.taskListContainer) dom.taskListContainer.innerHTML = '<p>データベースが選択されていません。</p>';
    return;
  }

  dom.taskListContainer.innerHTML = '<p>タスクを読み込み中...</p>';

  try {
    const props = await getDbProperties(dbId);
    if (!props?.title?.name) throw new Error('タイトルプロパティが見つかりません（title型が必要）');

    const statusFilter = buildStatusFilter(props);

    const body = {
      ...(statusFilter ? { filter: statusFilter } : {}),
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }]
    };

    const res = await notionApi(`/databases/${dbId}/query`, 'POST', body);
    const tasks = res?.results || [];
    renderTaskList(tasks, dbId, props);
  } catch (e) {
    console.error(e);
    dom.taskListContainer.innerHTML = `<p style="color:red;">エラー: ${e.message}</p>`;
  }
}

function renderTaskList(tasks, dbId, props) {
  if (!dom?.taskListContainer) return;

  if (!Array.isArray(tasks) || tasks.length === 0) {
    dom.taskListContainer.innerHTML = '<p>未着手/進行中のタスクはありません。</p>';
    return;
  }

  const ul = document.createElement('ul');
  ul.className = 'task-list';

  tasks.forEach(page => {
    const title = getPageTitle(page, props.title.name);

    const li = document.createElement('li');
    li.style.display = 'flex';
    li.style.justifyContent = 'space-between';
    li.style.alignItems = 'center';
    li.style.gap = '10px';

    const left = document.createElement('div');
    left.style.flex = '1';

    // assignee表示（任意）
    let assigneeText = '';
    if (props.assignee?.name) {
      const people = page?.properties?.[props.assignee.name]?.people || [];
      if (people.length > 0) assigneeText = people[0]?.name ? ` (${people[0].name})` : '';
    }

    left.textContent = `${title}${assigneeText}`;

    const btn = document.createElement('button');
    btn.textContent = '▶ 開始';
    btn.className = 'btn-green';

    btn.addEventListener('click', () => {
      const taskData = {
        id: page.id,
        dbId,
        title,
        togglEntryId: null,
        properties: {
          category: props.category?.name ? page?.properties?.[props.category.name]?.select || null : null,
          department: props.department?.name ? page?.properties?.[props.department.name]?.multi_select || [] : []
        }
      };
      startTask(taskData);
    });

    li.appendChild(left);
    li.appendChild(btn);
    ul.appendChild(li);
  });

  clearElement(dom.taskListContainer);
  dom.taskListContainer.appendChild(ul);
}

// =====================================================
// 新規タスクフォーム
// =====================================================
async function renderNewTaskForm() {
  const dbId = dom?.taskDbFilter?.value || null;

  if (!dbId) {
    if (dom?.targetDbDisplay) dom.targetDbDisplay.textContent = 'データベースを選択してください';
    clearElement(dom?.newCatContainer);
    clearElement(dom?.newDeptContainer);
    return;
  }

  const db = settings.databases.find(d => d.id === dbId);
  if (dom?.targetDbDisplay) dom.targetDbDisplay.textContent = `新規タスクの作成先: ${db ? db.name : '不明なDB'}`;

  try {
    const props = await getDbProperties(dbId);

    // カテゴリ（select）
    if (props?.category?.name && dom?.newCatContainer) {
      const options = props.category.options || [];
      dom.newCatContainer.innerHTML = `
        <div class="form-group">
          <label>${props.category.name}:</label>
          <div style="display:flex; gap:14px; flex-wrap:wrap;">
            ${options
              .map(
                opt => `
                <label style="display:flex; align-items:center;">
                  <input type="radio" name="newCatSelect" value="${opt.id}" data-name="${opt.name}" style="margin-right:6px;">
                  ${opt.name}
                </label>`
              )
              .join('')}
          </div>
        </div>
      `;
    } else {
      clearElement(dom?.newCatContainer);
    }

    // 部門（multi_select）
    if (props?.department?.name && dom?.newDeptContainer) {
      const options = props.department.options || [];
      dom.newDeptContainer.innerHTML = `
        <div class="form-group">
          <label>${props.department.name}:</label>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            ${options
              .map(
                opt => `
                <label>
                  <input type="checkbox" class="dept-checkbox" data-id="${opt.id}" data-name="${opt.name}">
                  ${opt.name}
                </label>`
              )
              .join('')}
          </div>
        </div>
      `;
    } else {
      clearElement(dom?.newDeptContainer);
    }
  } catch (e) {
    console.error(e);
    if (dom?.targetDbDisplay) dom.targetDbDisplay.textContent = `フォームの読み込みエラー: ${e.message}`;
    clearElement(dom?.newCatContainer);
    clearElement(dom?.newDeptContainer);
  }
}

async function handleStartNewTask() {
  const title = dom?.newTaskTitle?.value?.trim() || '';
  const dbId = dom?.taskDbFilter?.value || null;

  if (!title) {
    alert('タスク名を入力してください');
    return;
  }
  if (!dbId) {
    alert('データベースを選択してください');
    return;
  }

  try {
    const props = await getDbProperties(dbId);
    if (!props?.title?.name) throw new Error('タイトルプロパティが見つかりません');

    const properties = {
      [props.title.name]: { title: [{ text: { content: title } }] }
    };

    // category
    let newCatProp = null;
    const catRadio = document.querySelector('input[name="newCatSelect"]:checked');
    if (props.category?.name && catRadio) {
      newCatProp = { id: catRadio.value, name: catRadio.dataset.name };
      properties[props.category.name] = { select: { id: newCatProp.id } };
    }

    // department
    const selectedDepts = Array.from(document.querySelectorAll('.dept-checkbox:checked')).map(cb => ({
      id: cb.dataset.id,
      name: cb.dataset.name
    }));
    if (props.department?.name && selectedDepts.length > 0) {
      properties[props.department.name] = { multi_select: selectedDepts.map(d => ({ id: d.id })) };
    }

    // assignee
    if (props.assignee?.name && isFilled(settings.humanUserId)) {
      properties[props.assignee.name] = { people: [{ id: settings.humanUserId }] };
    }

    // status -> 進行中（作った瞬間に進行中にしたいならここ。嫌ならコメントアウトでOK）
    if (props.status?.name) {
      const opts = props.status.options || [];
      const opt = opts.find(o => o.name === STATUS_RUNNING);
      if (opt) {
        if (props.status.type === 'status') properties[props.status.name] = { status: { id: opt.id } };
        if (props.status.type === 'select') properties[props.status.name] = { select: { id: opt.id } };
      }
    }

    const createRes = await notionApi('/pages', 'POST', {
      parent: { database_id: dbId },
      properties
    });

    const newTaskData = {
      id: createRes.id,
      dbId,
      title,
      togglEntryId: null,
      properties: {
        category: newCatProp,
        department: selectedDepts
      }
    };

    showNotification(`新規タスク「${title}」を作成。計測開始します。`);
    if (dom?.newTaskTitle) dom.newTaskTitle.value = '';
    startTask(newTaskData);
  } catch (e) {
    console.error(e);
    alert(`新規タスク作成に失敗: ${e.message}`);
  }
}

// =====================================================
// Toggl start/stop（プロキシ経由）
// =====================================================
async function startToggl(title, tags = []) {
  if (!settings.togglWorkspaceId) throw new Error('Toggl workspaceId missing');
  const wid = parseInt(settings.togglWorkspaceId, 10);

  const url = `${TOGGL_V9_BASE_URL}/time_entries`;
  const body = {
    workspace_id: wid,
    description: title,
    created_with: 'Notion Toggl Timer WebApp',
    start: new Date().toISOString(),
    duration: -1,
    tags
  };

  const res = await externalTogglApi(url, 'POST', body);
  return res;
}

async function stopToggl(entryId) {
  if (!settings.togglWorkspaceId) throw new Error('Toggl workspaceId missing');
  const wid = settings.togglWorkspaceId;
  const url = `${TOGGL_V9_BASE_URL}/workspaces/${wid}/time_entries/${entryId}/stop`;
  return externalTogglApi(url, 'PATCH');
}

// =====================================================
// 実行・停止ロジック
// =====================================================
async function startTask(task) {
  if (settings.currentRunningTask) {
    alert('既にタスクが実行中です。停止/完了してから開始してください。');
    return;
  }

  try {
    const tags = [];
    const cat = task?.properties?.category?.name;
    const depts = (task?.properties?.department || []).map(d => d.name).filter(Boolean);
    if (cat) tags.push(cat);
    depts.forEach(t => tags.push(t));

    const togglEntry = await startToggl(task.title, tags);
    task.togglEntryId = togglEntry?.id;

    settings.currentRunningTask = task;
    settings.startTime = Date.now();

    // Notion status を進行中へ（失敗しても計測は継続）
    try {
      const props = await getDbProperties(task.dbId);
      if (props?.status?.name) {
        const opt = (props.status.options || []).find(o => o.name === STATUS_RUNNING);
        if (opt) {
          const patch = { properties: {} };
          if (props.status.type === 'status') patch.properties[props.status.name] = { status: { id: opt.id } };
          if (props.status.type === 'select') patch.properties[props.status.name] = { select: { id: opt.id } };
          await notionApi(`/pages/${task.id}`, 'PATCH', patch);
        }
      }
    } catch (e) {
      console.warn('Notionステータス更新 warning:', e?.message || e);
    }

    saveSettings();
    updateRunningTaskDisplay(true);
    await loadTasks();
    showNotification(`タスク「${task.title}」開始`);
  } catch (e) {
    console.error(e);
    alert(`開始に失敗: ${e.message}`);
    settings.currentRunningTask = null;
    settings.startTime = null;
    saveSettings();
    updateRunningTaskDisplay(false);
  }
}

async function stopTask(isComplete) {
  if (!settings.currentRunningTask || !settings.currentRunningTask.togglEntryId) {
    alert('実行中のタスクはありません');
    return;
  }

  const task = settings.currentRunningTask;
  const logText = dom?.thinkingLogInput?.value?.trim() || '';
  const durationMs = Date.now() - (settings.startTime || Date.now());
  const durationSeconds = Math.floor(durationMs / 1000);
  const durationMinutes = Math.round(durationSeconds / 60);

  try {
    await stopToggl(task.togglEntryId);

    const props = await getDbProperties(task.dbId);

    // 必要なら現ページを取る（累積/ログのため）
    let notionPage = null;
    if (props?.durationNumber?.name || props?.logRichText?.name) {
      try {
        notionPage = await notionApi(`/pages/${task.id}`, 'GET');
      } catch {
        notionPage = null;
      }
    }

    const patch = { properties: {} };

    // 累積時間（分）
    if (props?.durationNumber?.name) {
      const cur = notionPage?.properties?.[props.durationNumber.name]?.number || 0;
      patch.properties[props.durationNumber.name] = { number: cur + durationMinutes };
    }

    // ステータス
    if (props?.status?.name) {
      const nextName = isComplete ? STATUS_COMPLETE : STATUS_PAUSE;
      const opt = (props.status.options || []).find(o => o.name === nextName);
      if (opt) {
        if (props.status.type === 'status') patch.properties[props.status.name] = { status: { id: opt.id } };
        if (props.status.type === 'select') patch.properties[props.status.name] = { select: { id: opt.id } };
      }
    }

    // 完了日
    if (isComplete && props?.completionDate?.name) {
      patch.properties[props.completionDate.name] = {
        date: { start: new Date().toISOString().split('T')[0] }
      };
    }

    // 思考ログ追記（rich_text）
    if (logText && props?.logRichText?.name) {
      const curLog = (notionPage?.properties?.[props.logRichText.name]?.rich_text || [])
        .map(x => x?.plain_text || '')
        .join('');
      const stamp = `[${new Date().toLocaleDateString()}]`;
      const newLog = curLog ? `${curLog}\n\n${stamp}\n${logText}` : `${stamp}\n${logText}`;
      patch.properties[props.logRichText.name] = { rich_text: [{ text: { content: newLog } }] };
    }

    if (Object.keys(patch.properties).length > 0) {
      await notionApi(`/pages/${task.id}`, 'PATCH', patch);
    }

    // 状態クリア
    settings.currentRunningTask = null;
    settings.startTime = null;
    if (dom?.thinkingLogInput) dom.thinkingLogInput.value = '';

    saveSettings();
    updateRunningTaskDisplay(false);
    await loadTasks();

    showNotification(
      `タスク「${task.title}」を${isComplete ? '完了' : '停止'}（${formatTime(durationMs)}）`
    );
  } catch (e) {
    console.error(e);
    alert(`停止/完了でエラー: ${e.message}\n（Toggl側が止まってない可能性あるので念のため確認してね）`);

    // ここは強制的に状態は落とす（無限に詰まるのを防ぐ）
    settings.currentRunningTask = null;
    settings.startTime = null;
    saveSettings();
    updateRunningTaskDisplay(false);
  }
}

// =====================================================
// 実行中UI
// =====================================================
function updateTimer() {
  if (settings.startTime && dom?.runningTimer) {
    const elapsed = Date.now() - settings.startTime;
    dom.runningTimer.textContent = formatTime(elapsed);
  }
}

function updateRunningTaskDisplay(isRunning) {
  if (!dom) return;

  if (isRunning) {
    dom.runningTaskContainer?.classList.remove('hidden');
    dom.taskSelectionSection?.classList.add('hidden');
    dom.kpiReportTab?.classList.add('hidden');

    if (dom.runningTaskTitle) dom.runningTaskTitle.textContent = settings.currentRunningTask?.title || '実行中タスク';

    if (!settings.timerInterval) {
      settings.timerInterval = setInterval(updateTimer, 1000);
    }
  } else {
    dom.runningTaskContainer?.classList.add('hidden');

    // KPIがアクティブじゃなければタスク選択に戻す
    if (!dom.toggleKpiReportBtn?.classList.contains('active')) {
      dom.taskSelectionSection?.classList.remove('hidden');
    }

    if (settings.timerInterval) {
      clearInterval(settings.timerInterval);
      settings.timerInterval = null;
    }
    if (dom.runningTimer) dom.runningTimer.textContent = '00:00:00';
  }
}

function checkRunningState() {
  if (settings.currentRunningTask && settings.startTime) {
    updateRunningTaskDisplay(true);
    updateTimer();
  } else {
    updateRunningTaskDisplay(false);
  }
}

// =====================================================
// タブ切り替え（data-target: existing/new/report）
// =====================================================
// =====================================================
// タブ切り替え（data-target: existing / new / report）
// =====================================================
function switchTab(event) {
  const target = event?.currentTarget?.dataset?.target;
  if (!target) return;

  // --- active状態リセット ---
  dom.startExistingTask?.classList.remove('active');
  dom.startNewTask?.classList.remove('active');
  dom.toggleKpiReportBtn?.classList.remove('active');
  event.currentTarget.classList.add('active');

  // ==================================
  // KPI レポート
  // ==================================
  if (target === 'report') {
    // KPIだけ表示
    dom.kpiReportTab?.classList.remove('hidden');

    // タスク系は隠す
    dom.existingTaskTab?.classList.add('hidden');
    dom.newTaskTab?.classList.add('hidden');

    // ⚠️ ここ重要：taskSelectionSectionは隠さない
    // dom.taskSelectionSection?.classList.add('hidden'); ← ❌ 削除

    // 初期表示
    if (dom.kpiResultsContainer) {
      dom.kpiResultsContainer.innerHTML =
        '<p>期間を選択して「集計」を押してください</p>';
    }
    if (dom.reportTotalTime) {
      dom.reportTotalTime.textContent = '';
    }
    return;
  }

  // ==================================
  // 既存 / 新規 タスク
  // ==================================

  // KPIは閉じる
  dom.kpiReportTab?.classList.add('hidden');

  // タスク選択は常に表示
  dom.taskSelectionSection?.classList.remove('hidden');

  if (target === 'existing') {
    dom.existingTaskTab?.classList.remove('hidden');
    dom.newTaskTab?.classList.add('hidden');
  }

  if (target === 'new') {
    dom.existingTaskTab?.classList.add('hidden');
    dom.newTaskTab?.classList.remove('hidden');
    renderNewTaskForm();
  }
}

// =====================================================
// KPI（Toggl V9 time_entries 期間取得 → tags集計）
// =====================================================
function calculateReportDates(period) {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let start;

  switch (period) {
    case 'current_week': {
      const dayOfWeek = (now.getDay() + 6) % 7; // 0=月曜
      start = new Date(now);
      start.setDate(now.getDate() - dayOfWeek);
      break;
    }
    case 'last_week': {
      const lastWeek = new Date(now);
      lastWeek.setDate(now.getDate() - 7);
      const dayOfWeek = (lastWeek.getDay() + 6) % 7;
      start = new Date(lastWeek);
      start.setDate(lastWeek.getDate() - dayOfWeek);
      end.setTime(start.getTime());
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case 'current_month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'last_month': {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      // 先月末
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
      break;
    }
    default: {
      const dayOfWeek = (now.getDay() + 6) % 7;
      start = new Date(now);
      start.setDate(now.getDate() - dayOfWeek);
    }
  }

  start.setHours(0, 0, 0, 0);
  return { startDate: start, endDate: end };
}

async function fetchKpiReport() {
  if (!settings.togglApiToken || !settings.togglWorkspaceId) {
    alert('Toggl設定が未入力です');
    return;
  }

  const period = dom.reportPeriodSelect?.value || 'current_week';
  const { startDate, endDate } = calculateReportDates(period);

  const url = 'https://api.track.toggl.com/reports/api/v2/summary';

  const body = {
    workspace_id: Number(settings.togglWorkspaceId),
    since: startDate.toISOString().split('T')[0],
    until: endDate.toISOString().split('T')[0],
    grouping: 'tags',
    subgrouping: 'none'
  };

  const res = await externalTogglApi(url, 'POST', body);

  let totalMs = 0;
  clearElement(dom.kpiResultsContainer);

  if (!res?.data || res.data.length === 0) {
    dom.kpiResultsContainer.innerHTML = '<p>データがありません</p>';
    dom.reportTotalTime.textContent = '';
    return;
  }

  const ul = document.createElement('ul');

  res.data.forEach(row => {
    const tag = row.title?.tag || '(no tag)';
    const ms = row.time || 0;
    totalMs += ms;

    const li = document.createElement('li');
    li.textContent = `${tag}: ${formatTime(ms)}`;
    ul.appendChild(li);
  });

  dom.kpiResultsContainer.appendChild(ul);
  dom.reportTotalTime.textContent = `合計: ${formatTime(totalMs)}`;

  showNotification('KPI取得完了');
}



// =====================================================
// Init
// =====================================================
async function bootstrapIfPossible() {
  // 設定が揃ってたら初期ロード
  if (settings.notionToken && Array.isArray(settings.notionDatabases) && settings.notionDatabases.length > 0) {
    try {
      await fetchDatabaseList();
      await loadTasks();
      checkRunningState();
    } catch (e) {
      console.error(e);
      showNotification(`初期ロードでエラー: ${e.message}`, 6000);
      showSettings();
    }
  } else {
    showSettings();
  }
}

function init() {
  dom = getDomElements();
  loadSettings();

  // 設定画面の初期値
  if (dom?.confNotionToken) dom.confNotionToken.value = settings.notionToken || '';
  if (dom?.confNotionUserId) dom.confNotionUserId.value = settings.humanUserId || '';
  if (dom?.confTogglToken) dom.confTogglToken.value = settings.togglApiToken || '';
  if (dom?.confTogglWid) dom.confTogglWid.value = settings.togglWorkspaceId || '';

  // 設定関連
  dom?.toggleSettingsButton?.addEventListener('click', showSettings);
  dom?.cancelConfigButton?.addEventListener('click', hideSettings);
  dom?.saveConfigButton?.addEventListener('click', () => handleSaveSettings());
  dom?.addDbConfigButton?.addEventListener('click', handleAddDbConfig);

  // タスク関連
  dom?.taskDbFilter?.addEventListener('change', () => loadTasks());
  dom?.reloadTasksButton?.addEventListener('click', () => loadTasks());

  // タブ
  dom?.startExistingTask?.addEventListener('click', switchTab);
  dom?.startNewTask?.addEventListener('click', switchTab);
  dom?.toggleKpiReportBtn?.addEventListener('click', switchTab);

  // 新規タスク
  dom?.startNewTaskButton?.addEventListener('click', () => handleStartNewTask());
  dom?.newTaskForm?.addEventListener('submit', e => e.preventDefault());

  // 実行中操作
  dom?.stopTaskButton?.addEventListener('click', () => stopTask(false));
  dom?.completeTaskButton?.addEventListener('click', () => stopTask(true));

  // KPI
  dom?.fetchKpiButton?.addEventListener('click', () => {
    console.log('🔥 KPIボタンクリック検知！');
    fetchKpiReport();
  });

  // 初期ロード
  bootstrapIfPossible();
}

init();
