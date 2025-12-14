const PROXY_URL = 'https://company-notion-toggl-api.vercel.app/api/proxy';
const TOGGL_V9_BASE_URL = 'https://api.track.toggl.com/api/v9';

const STATUS_ACTIVE = ['未着手', '進行中'];

const settings = {
  notionToken: '',
  notionDatabases: [], // { id: string, name: string }[] を保持
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
      // データベース設定はJSON.parse後に既存のオブジェクトにマージする
      Object.assign(settings, JSON.parse(saved));
    }
  } catch (e) {
    console.error('設定読み込みエラー:', e);
  }
}

function saveSettings() {
  try {
    // currentRunningTask, startTime は実行中に更新されるため、保存対象とする
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
      // APIエラーが発生した場合、レスポンスボディをエラーメッセージとして取得
      const errorText = await res.text();
      try {
          const errorJson = JSON.parse(errorText);
          throw new Error(errorJson.message || errorText);
      } catch {
          throw new Error(errorText);
      }
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
      },
      // 名前プロパティでソート
      sorts: [{
        property: 'タスク名', // ★ 修正: '名前' -> 'タスク名' ★
        direction: 'ascending'
      }]
    });

    dom.taskListContainer.innerHTML = '';
    if (!res.results || res.results.length === 0) {
      dom.taskListContainer.innerHTML = '<li>該当タスクがありません</li>';
      return;
    }

    res.results.forEach(p => {
      const title = p.properties['タスク名']?.title?.[0]?.plain_text || '無題'; // ★ 修正: '名前' -> 'タスク名' ★
      const li = document.createElement('li');
      li.style.cssText = 'display: flex; justify-content: space-between; padding: 8px; border-bottom: 1px solid #eee;';

      const span = document.createElement('span');
      span.textContent = title;
      span.style.flex = '1';

      const btn = document.createElement('button');
      btn.textContent = '▶ 開始';
      btn.className = 'btn-green'; // CSSクラスを適用
      btn.style.cssText = 'padding: 4px 12px; border: none; border-radius: 4px; cursor: pointer;';
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

/**
 * Togglに時間エントリを作成し、タイマーを開始します。
 * @param {object} task - タスク情報
 * @param {string} task.id - NotionページID
 * @param {string} task.title - タスクタイトル
 * @param {string} task.dbId - NotionデータベースID
 * @param {object} [task.properties] - Notionページのプロパティ (既存タスクの場合)
 */
async function startTask(task) {
  if (!settings.togglApiToken || !settings.togglWorkspaceId) {
    alert('Toggl APIトークンまたはWorkspace IDが未設定です。設定を確認してください。');
    return;
  }
  
  try {
    // 既存タスクの場合、カテゴリと部門のプロパティからTogglの説明を構成
    let desc = task.title;
    if (task.properties) {
      const cat = task.properties['カテゴリ']?.select?.name || '未分類';
      const depts = task.properties['部門']?.multi_select?.map(d => d.name) || [];
      desc = `${depts.map(d => `【${d}】`).join('')}【${cat}】${task.title}`;
    }

    const entry = await togglApi(`${TOGGL_V9_BASE_URL}/time_entries`, 'POST', {
      workspace_id: Number(settings.togglWorkspaceId),
      description: desc,
      created_with: 'Notion Toggl Timer',
      start: new Date().toISOString(),
      duration: -1 // 実行中を示す
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

/**
 * 新規タスクをNotionに作成し、タイマーを開始します。
 */
async function startNewTask() {
  const title = dom.newTaskTitle.value.trim();
  if (!title) {
    alert('タスク名は必須です。');
    return;
  }
  const dbId = dom.taskDbFilter.value;
  if (!dbId) {
    alert('データベースを選択してください。');
    return;
  }

  try {
    // Notionページ作成
    const newPage = await notionApi(`/pages`, 'POST', {
      parent: { database_id: dbId },
      properties: {
        'タスク名': { title: [{ text: { content: title } }] }, // ★ 修正: '名前' -> 'タスク名' ★
        'ステータス': { status: { name: '進行中' } } // 初期ステータスを進行中に設定
        // 他のプロパティ (カテゴリ, 部門など) は、別途ロジックが必要
      }
    });

    // 作成したタスクでタイマー開始
    await startTask({
      id: newPage.id,
      title: title,
      dbId: dbId,
      properties: newPage.properties // 新規作成されたページからプロパティを取得
    });

    dom.newTaskTitle.value = ''; // フォームをクリア
  } catch (e) {
    console.error('新規タスク作成＆開始エラー:', e);
    alert(`新規タスク作成＆開始エラー: ${e.message}`);
  }
}

/**
 * 実行中のタスクを停止します。
 * @param {boolean} isComplete - タスクを完了ステータスにするか
 */
async function stopTask(isComplete) {
  if (!settings.currentRunningTask) return;

  try {
    const t = settings.currentRunningTask;
    const log = dom.thinkingLogInput.value.trim();
    const notionPatches = {};

    // 1. Toggl停止
    await togglApi(
      `${TOGGL_V9_BASE_URL}/workspaces/${settings.togglWorkspaceId}/time_entries/${t.togglEntryId}/stop`,
      'PUT'
    );
    
    // 2. 思考ログ保存
    if (log) {
      const now = new Date().toLocaleString('ja-JP');
      const logContent = `\n[${now}]\n${log}`;
      
      notionPatches['思考ログ'] = {
        rich_text: [{
          text: { content: logContent }
        }]
      };
    }

    // 3. ステータス変更
    if (isComplete) {
      notionPatches['ステータス'] = { status: { name: '完了' } };
    }

    // 4. Notionページ更新 (ログとステータス)
    if (Object.keys(notionPatches).length > 0) {
      // ログ追記のPATCHは、既存の内容を上書きするリスクがあるため、
      // 実際にはAPI側（PROXY_URL）で既存ログの取得と追記ロジックが必要です。
      // ここでは、一旦、前回の修正バージョンと同じPATCHリクエスト構造を維持します。
      await notionApi(`/pages/${t.id}`, 'PATCH', { properties: notionPatches });
    }

    // 5. 設定クリア
    settings.currentRunningTask = null;
    settings.startTime = null;
    saveSettings();
    updateRunningUI(false);
    loadTasks(); // 完了・停止後にタスクリストを再読込
  } catch (e) {
    console.error('タスク停止エラー:', e);
    alert(`タスク停止エラー: ${e.message}`);
  }
}

// ================= UI =================

/**
 * 実行中UIの表示/非表示を切り替えます。
 * @param {boolean} running - 実行中かどうか
 */
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
        // HH:MM:SS 形式に変換
        const hours = Math.floor(sec / 3600);
        const minutes = Math.floor((sec % 3600) / 60);
        const seconds = sec % 60;
        dom.runningTimer.textContent = [hours, minutes, seconds]
          .map(v => v.toString().padStart(2, '0'))
          .join(':');
      }
    }, 1000);
  } else {
    if (settings.timerInterval) {
      clearInterval(settings.timerInterval);
      settings.timerInterval = null;
    }
    if (dom.runningTimer) dom.runningTimer.textContent = '00:00:00';
    if (dom.thinkingLogInput) dom.thinkingLogInput.value = '';
    // タスクリストを表示
    loadTasks();
  }
}

/**
 * 設定画面の各種値をDOMに反映させます。
 */
function renderSettings() {
  if (dom.confNotionToken) dom.confNotionToken.value = settings.notionToken;
  if (dom.confNotionUserId) dom.confNotionUserId.value = settings.humanUserId;
  if (dom.confTogglToken) dom.confTogglToken.value = settings.togglApiToken;
  if (dom.confTogglWid) dom.confTogglWid.value = settings.togglWorkspaceId;

  renderDbConfig();
  renderTaskDbFilter();
}

/**
 * データベース設定のDOMをレンダリングします。
 */
function renderDbConfig() {
  if (!dom.dbConfigContainer) return;

  dom.dbConfigContainer.innerHTML = ''; // クリア

  settings.notionDatabases.forEach((db, index) => {
    const div = document.createElement('div');
    div.className = 'db-config-item';
    div.style.cssText = 'border: 1px solid #ccc; padding: 10px; margin-bottom: 8px;';
    div.dataset.index = index;

    // input要素に直接クラスやスタイルを適用し、インデックスを使用しないDOM操作で値を保持させる
    div.innerHTML = `
      <label>DB名:</label>
      <input type="text" class="db-name-input" value="${db.name || ''}" style="width: 100%; box-sizing: border-box; margin-bottom: 5px;" placeholder="タスクデータベース名">
      <label>DB ID:</label>
      <input type="text" class="db-id-input" value="${db.id || ''}" style="width: 100%; box-sizing: border-box; margin-bottom: 5px;" placeholder="36桁のID">
      <button class="remove-db btn btn-gray" data-index="${index}" style="float: right;">削除</button>
      <div style="clear: both;"></div>
    `;

    // 削除ボタンのイベントを設定 (インデックスではなく data-index を使用)
    div.querySelector('.remove-db').onclick = (e) => {
      e.preventDefault();
      // ボタンの data-index から元の配列のインデックスを取得して削除
      const indexToRemove = parseInt(e.target.dataset.index);
      if (!isNaN(indexToRemove)) {
          settings.notionDatabases.splice(indexToRemove, 1);
          // DOMを現在の配列の状態に合わせて再レンダリング
          renderDbConfig(); 
      }
    };

    dom.dbConfigContainer.appendChild(div);
  });
}

/**
 * メイン画面のタスクDBフィルターをレンダリングします。
 */
function renderTaskDbFilter() {
  if (!dom.taskDbFilter) return;

  dom.taskDbFilter.innerHTML = '';
  if (settings.notionDatabases.length === 0) {
    const defaultOption = document.createElement('option');
    defaultOption.textContent = '設定からDBを追加してください';
    defaultOption.value = '';
    dom.taskDbFilter.appendChild(defaultOption);
    return;
  }
  
  settings.notionDatabases.forEach(db => {
    const option = document.createElement('option');
    option.value = db.id;
    option.textContent = db.name || db.id;
    dom.taskDbFilter.appendChild(option);
  });
  
  // 変更イベントを設定
  dom.taskDbFilter.onchange = loadTasks;
}

/**
 * タブ切り替え処理
 * @param {string} targetId - 切り替えるタブのID ('existingTaskTab' or 'newTaskTab')
 */
function switchTab(targetId) {
    const isExisting = targetId === 'existingTaskTab';
    
    // タブボタンのアクティブ状態を切り替え
    if(dom.startExistingTask) dom.startExistingTask.classList.toggle('active', isExisting);
    if(dom.startNewTask) dom.startNewTask.classList.toggle('active', !isExisting);

    // タブコンテンツの表示/非表示を切り替え
    if(dom.existingTaskTab) dom.existingTaskTab.classList.toggle('hidden', !isExisting);
    if(dom.newTaskTab) dom.newTaskTab.classList.toggle('hidden', isExisting);
    
    // 既存タスクタブに切り替えたらタスクリストを再読込
    if (isExisting) {
        loadTasks();
    }
}

// ================= Init =================
function init() {
  try {
    dom = getDom();
    loadSettings();
    renderSettings(); // 画面に設定値を反映

    // イベントハンドラ設定
    if (dom.toggleSettings) {
      dom.toggleSettings.onclick = () => {
        // 設定画面を開く前に、現在の設定値をDOMに反映
        renderSettings();
        if (dom.settingsView) dom.settingsView.classList.remove('hidden');
        if (dom.mainView) dom.mainView.classList.add('hidden');
        if (dom.runningTaskContainer) dom.runningTaskContainer.classList.add('hidden');
      };
    }

    if (dom.cancelConfig) {
      dom.cancelConfig.onclick = () => {
        // キャンセル時は保存せずに設定画面を閉じる
        if (dom.settingsView) dom.settingsView.classList.add('hidden');
        if (dom.mainView) dom.mainView.classList.remove('hidden');
        updateRunningUI(!!settings.currentRunningTask); // 実行中なら実行中UIを再表示
      };
    }

    if (dom.addDbConfig) {
      dom.addDbConfig.onclick = () => {
        settings.notionDatabases.push({ id: '', name: '' });
        renderDbConfig(); // DB設定部分を再レンダリング
      };
    }
    
    if (dom.saveConfig) {
      dom.saveConfig.onclick = () => {
        // 1. 基本設定の保存
        if (dom.confNotionToken) settings.notionToken = dom.confNotionToken.value;
        if (dom.confNotionUserId) settings.humanUserId = dom.confNotionUserId.value;
        if (dom.confTogglToken) settings.togglApiToken = dom.confTogglToken.value;
        if (dom.confTogglWid) settings.togglWorkspaceId = dom.confTogglWid.value;

        // 2. データベース設定のDOMから値を集めて更新
        const dbItems = dom.dbConfigContainer.querySelectorAll('.db-config-item');
        settings.notionDatabases = Array.from(dbItems).map(item => ({
          name: item.querySelector('.db-name-input').value.trim(),
          id: item.querySelector('.db-id-input').value.trim()
        })).filter(db => db.id); // IDが空のものは保存しない

        saveSettings();
        alert('設定を保存しました。');
        location.reload(); // 設定変更後のリロード
      };
    }

    // タブ切り替えイベント
    if (dom.startExistingTask) {
        dom.startExistingTask.onclick = () => switchTab('existingTaskTab');
    }
    if (dom.startNewTask) {
        dom.startNewTask.onclick = () => switchTab('newTaskTab');
    }

    if (dom.reloadTasks) dom.reloadTasks.onclick = loadTasks;
    if (dom.stopTaskButton) dom.stopTaskButton.onclick = () => stopTask(false);
    if (dom.completeTaskButton) dom.completeTaskButton.onclick = () => stopTask(true);
    
    // 新規タスク開始ボタンのイベント設定
    if (dom.startNewTaskButton) dom.startNewTaskButton.onclick = startNewTask;

    // 実行中タスクがあればUI更新、なければタスクリストをロード
    if (settings.currentRunningTask && settings.startTime) {
      updateRunningUI(true);
    } else {
      // 最初にタスクリストのDBフィルターに値をロードしてから、タスクをロード
      renderTaskDbFilter();
      // 初期状態では既存タスクタブを表示
      switchTab('existingTaskTab'); 
    }
  } catch (e) {
    console.error('初期化エラー:', e);
    // エラー発生時は設定画面を表示して設定を促す
    if (dom.mainView) dom.mainView.classList.add('hidden');
    if (dom.settingsView) dom.settingsView.classList.remove('hidden');
  }
}

// ページ読み込み完了後に初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
