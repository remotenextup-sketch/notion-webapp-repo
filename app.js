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
  try {
    const saved = localStorage.getItem('settings');
    if (saved) {
      Object.assign(settings, JSON.parse(saved));
    }
  } catch (e) {
    console.error('設定読み込みエラー:', e);
  }
}

function saveSettings() {
  try {
    localStorage.setItem('settings', JSON.stringify({
      notionToken: settings.notionToken,
      notionDatabases: settings.notionDatabases,
      humanUserId: settings.humanUserId,
      togglApiToken: settings.togglApiToken,
      togglWorkspaceId: settings.togglWorkspaceId,
      currentRunningTask: settings.currentRunningTask,
      startTime: settings.startTime
    }));
  } catch (e) {
    console.error('設定保存エラー:', e);
  }
}

// ================= API =================
async function externalApi(targetUrl, method = 'GET', auth, body = null) {
  try {
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUrl,
        method,
        tokenKey: auth.key,
        tokenValue: auth.value,
        notionVersion: auth.notionVersion || '',
        body
      })
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    return res.status === 204 ? null : await res.json();
  } catch (e) {
    console.error('APIエラー:', e);
    throw e;
  }
}

const notionApi = (endpoint, method, body) =>
  externalApi(`https://api.notion.com/v1${endpoint}`, method, {
    key: 'notionToken',
    value: settings.notionToken,
    notionVersion: '2022-06-28'
  }, body);

const togglApi = (url, method, body) =>
  externalApi(url, method, {
    key: 'togglApiToken',
    value: settings.togglApiToken
  }, body);

// ================= Tasks =================
async function loadTasks() {
  if (!settings.notionToken) {
    console.warn('Notion token 未設定のためタスク読込を中断');
    dom.taskListContainer.innerHTML = '<li>Notionトークンを設定してください</li>';
    return;
  }

  try {
    const dbId = dom.taskDbFilter.value;
    if (!dbId) {
      dom.taskListContainer.innerHTML = '<li>データベースを選択してください</li>';
      return;
    }

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
    if (!res.results || res.results.length === 0) {
      dom.taskListContainer.innerHTML = '<li>該当タスクがありません</li>';
      return;
    }

    res.results.forEach(p => {
      const title = p.properties['名前']?.title?.[0]?.plain_text || '無題';
      const li = document.createElement('li');
      li.style.cssText = 'display: flex; justify-content: space-between; padding: 8px; border-bottom: 1px solid #eee;';

      const span = document.createElement('span');
      span.textContent = title;
      span.style.flex = '1';

      const btn = document.createElement('button');
      btn.textContent = '▶ 開始';
      btn.style.cssText = 'padding: 4px 12px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;';
      btn.onclick = () => startTask({
        id: p.id,
        title,
        dbId,
        properties: p.properties
      });

      li.append(span, btn);
      dom.taskListContainer.appendChild(li);
    });
  } catch (e) {
    console.error('タスク読み込みエラー:', e);
    dom.taskListContainer.innerHTML = `<li style="color: red;">エラー: ${e.message}</li>`;
  }
}

// ================= Start / Stop =================
async function startTask(task) {
  try {
    const cat = task.properties['カテゴリ']?.select?.name || '未分類';
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
  } catch (e) {
    console.error('タスク開始エラー:', e);
    alert(`タスク開始エラー: ${e.message}`);
  }
}

async function stopTask(isComplete) {
  if (!settings.currentRunningTask) return;

  try {
    const t = settings.currentRunningTask;
    
    // Toggl停止
    await togglApi(
      `${TOGGL_V9_BASE_URL}/workspaces/${settings.togglWorkspaceId}/time_entries/${t.togglEntryId}`,
      'PATCH',
      { stop: true }
    );

    // 思考ログ保存
    const log = dom.thinkingLogInput.value.trim();
    if (log) {
      const now = new Date().toLocaleString('ja-JP');
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

    // 設定クリア
    settings.currentRunningTask = null;
    settings.startTime = null;
    saveSettings();
    updateRunningUI(false);
    loadTasks();
  } catch (e) {
    console.error('タスク停止エラー:', e);
    alert(`タスク停止エラー: ${e.message}`);
  }
}

// ================= UI =================
function updateRunningUI(running) {
  if (dom.mainView) dom.mainView.classList.toggle('hidden', running);
  if (dom.settingsView) dom.settingsView.classList.add('hidden');
  if (dom.runningTaskContainer) dom.runningTaskContainer.classList.toggle('hidden', !running);

  if (running && settings.currentRunningTask) {
    dom.runningTaskTitle.textContent = settings.currentRunningTask.title;
    
    // 既存タイマー停止
    if (settings.timerInterval) {
      clearInterval(settings.timerInterval);
    }
    
    // 新しいタイマー開始
    settings.timerInterval = setInterval(() => {
      if (!settings.startTime) return;
      const sec = Math.floor((Date.now() - settings.startTime) / 1000);
      if (dom.runningTimer) {
        dom.runningTimer.textContent = new Date(sec * 1000).toISOString().substr(11, 8);
      }
    }, 1000);
  } else {
    if (settings.timerInterval) {
      clearInterval(settings.timerInterval);
      settings.timerInterval = null;
    }
    if (dom.runningTimer) dom.runningTimer.textContent = '00:00:00';
    if (dom.thinkingLogInput) dom.thinkingLogInput.value = '';
  }
}

// ================= Init =================
function init() {
  try {
    dom = getDom();
    loadSettings();

    // イベントハンドラ設定
    if (dom.toggleSettings) {
      dom.toggleSettings.onclick = () => {
        if (dom.settingsView) dom.settingsView.classList.remove('hidden');
        if (dom.mainView) dom.mainView.classList.add('hidden');
      };
    }

    if (dom.cancelConfig) {
      dom.cancelConfig.onclick = () => {
        if (dom.settingsView) dom.settingsView.classList.add('hidden');
        if (dom.mainView) dom.mainView.classList.remove('hidden');
      };
    }

    if (dom.saveConfig) {
      dom.saveConfig.onclick = () => {
        if (dom.confNotionToken) settings.notionToken = dom.confNotionToken.value;
        if (dom.confNotionUserId) settings.humanUserId = dom.confNotionUserId.value;
        if (dom.confTogglToken) settings.togglApiToken = dom.confTogglToken.value;
        if (dom.confTogglWid) settings.togglWorkspaceId = dom.confTogglWid.value;
        saveSettings();
        location.reload();
      };
    }

    if (dom.reloadTasks) dom.reloadTasks.onclick = loadTasks;
    if (dom.stopTaskButton) dom.stopTaskButton.onclick = () => stopTask(false);
    if (dom.completeTaskButton) dom.completeTaskButton.onclick = () => stopTask(true);

    // 実行中タスクがあればUI更新
    if (settings.currentRunningTask && settings.startTime) {
      updateRunningUI(true);
    } else {
      loadTasks();
    }
  } catch (e) {
    console.error('初期化エラー:', e);
  }
}

// ページ読み込み完了後に初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
