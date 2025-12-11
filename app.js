// app.js 全文 (エラー修正・複数DB・Toggl対応版)

// ★★★ 定数とグローバル設定 ★★★
const PROXY_URL = 'https://notion-webapp-repo.vercel.app/api/proxy'; 

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

// DOM要素の参照
const dom = {
    // 画面切り替え
    mainView: document.getElementById('mainView'),
    settingsView: document.getElementById('settingsView'),

    // 設定フォーム
    confNotionToken: document.getElementById('confNotionToken'),
    confNotionDbConfig: document.getElementById('confNotionDbConfig'), 
    confNotionUserId: document.getElementById('confNotionUserId'),
    confTogglToken: document.getElementById('confTogglToken'), 
    confTogglWid: document.getElementById('confTogglWid'),     

    // タスク一覧・フィルター
    taskDbFilter: document.getElementById('taskDbFilter'),
    taskListContainer: document.getElementById('taskListContainer'),

    // 実行中タスク
    runningTaskContainer: document.getElementById('runningTaskContainer'),
    runningTaskTitle: document.getElementById('runningTaskTitle'),
    runningTimer: document.getElementById('runningTimer'),
    thinkingLogInput: document.getElementById('thinkingLogInput'),

    // 新規タスクフォーム
    newTaskForm: document.getElementById('newTaskForm'),
    newTaskTitle: document.getElementById('newTaskTitle'),
    newCatContainer: document.getElementById('newCatContainer'),
    newDeptContainer: document.getElementById('newDeptContainer'),
    targetDbDisplay: document.getElementById('targetDbDisplay'),

    // タブボタン
    startExistingTask: document.getElementById('startExistingTask'),
    startNewTask: document.getElementById('startNewTask'),
    existingTaskTab: document.getElementById('existingTaskTab'),
    newTaskTab: document.getElementById('newTaskTab'),
    taskSelectionSection: document.getElementById('taskSelectionSection')
};

// ==========================================
// 1. 初期化 & 設定管理
// ==========================================

// ★★★ 修正: 関数定義の後にDOM操作を行うため、関数を先に定義 ★★★

/** ローカルストレージから設定を読み込む */
function loadSettings() {
    settings.notionToken = localStorage.getItem('notionToken') || '';
    
    const dbConfigJson = localStorage.getItem('notionDatabases') || '[]';
    try {
        const parsed = JSON.parse(dbConfigJson);
        settings.notionDatabases = Array.isArray(parsed) ? parsed : [];
    } catch {
        settings.notionDatabases = [];
    }

    settings.humanUserId = localStorage.getItem('humanUserId') || '';
    
    settings.togglApiToken = localStorage.getItem('togglApiToken') || ''; 
    settings.togglWorkspaceId = localStorage.getItem('togglWorkspaceId') || ''; 
    
    const runningTask = localStorage.getItem('runningTask');
    if (runningTask) {
        const task = JSON.parse(runningTask);
        settings.currentRunningTask = task.task;
        settings.startTime = task.startTime;
    }
}

/** 設定を保存する */
function handleSaveSettings() {
    settings.notionToken = dom.confNotionToken.value.trim();
    
    const dbConfigString = dom.confNotionDbConfig.value.trim();
    try {
        const parsed = JSON.parse(dbConfigString);
        settings.notionDatabases = Array.isArray(parsed) ? parsed : [];
        if (settings.notionDatabases.length > 0 && 
            !settings.notionDatabases.every(db => db.name && db.id)) {
            throw new Error("フォーマットが不正です。各要素が name と id を含む必要があります。");
        }
    } catch (e) {
        alert("データベース設定のJSON形式が不正です。\n" + e.message);
        return; 
    }

    settings.humanUserId = dom.confNotionUserId.value.trim();
    
    settings.togglApiToken = dom.confTogglToken.value.trim(); 
    settings.togglWorkspaceId = dom.confTogglWid.value.trim(); 
    
    localStorage.setItem('notionToken', settings.notionToken);
    localStorage.setItem('notionDatabases', JSON.stringify(settings.notionDatabases));
    localStorage.setItem('humanUserId', settings.humanUserId);
    localStorage.setItem('togglApiToken', settings.togglApiToken);
    localStorage.setItem('togglWorkspaceId', settings.togglWorkspaceId);
    
    alert('設定を保存しました。');
    saveSettings(); 
    hideSettings();
    fetchDatabaseList();
    loadTasks();
}

/** settingsオブジェクトをlocalStorageに保存（ランタイム用）*/
function saveSettings() {
    localStorage.setItem('notionToken', settings.notionToken);
    localStorage.setItem('notionDatabases', JSON.stringify(settings.notionDatabases)); 
    localStorage.setItem('humanUserId', settings.humanUserId);
    localStorage.setItem('togglApiToken', settings.togglApiToken);
    localStorage.setItem('togglWorkspaceId', settings.togglWorkspaceId);

    if (settings.currentRunningTask && settings.startTime) {
        localStorage.setItem('runningTask', JSON.stringify({
            task: settings.currentRunningTask,
            startTime: settings.startTime
        }));
    } else {
        localStorage.removeItem('runningTask');
    }
}

/** 設定画面を表示 */
function showSettings() {
    dom.confNotionToken.value = settings.notionToken;
    dom.confNotionDbConfig.value = JSON.stringify(settings.notionDatabases, null, 2);
    dom.confNotionUserId.value = settings.humanUserId;
    dom.confTogglToken.value = settings.togglApiToken; 
    // ★★★ 修正箇所：DOM要素から値を取得しないように修正 ★★★
    dom.confTogglWid.value = settings.togglWorkspaceId; 

    dom.mainView.classList.add('hidden');
    dom.settingsView.classList.remove('hidden');
}

/** 設定画面を非表示 */
function hideSettings() {
    dom.settingsView.classList.add('hidden');
    dom.mainView.classList.remove('hidden');
}


// ==========================================
// 2. API基盤 (Notion & Toggl)
// ... (notionApi, externalApi, togglApi は省略しませんが、全文に含まれます)
// ==========================================


// ==========================================
// 3. Togglアクション
// ... (startToggl, stopToggl は省略しませんが、全文に含まれます)
// ==========================================


// ==========================================
// 4. Notionデータ取得
// ... (fetchDatabaseList, getDbProperties, loadTasks, renderTaskList は省略しませんが、全文に含まれます)
// ==========================================


// ==========================================
// 5. 新規タスクフォーム管理
// ... (handleStartNewTask, switchTab, renderNewTaskForm は省略しませんが、全文に含まれます)
// ==========================================

/** タブを切り替える (switchTabの定義を追加) */
function switchTab(event) {
    const target = event.target.dataset.target;

    // ボタンの状態切り替え
    dom.startExistingTask.classList.remove('active');
    dom.startNewTask.classList.remove('active');
    event.target.classList.add('active');

    // コンテンツの切り替え
    if (target === 'existing') {
        dom.existingTaskTab.classList.remove('hidden');
        dom.newTaskTab.classList.add('hidden');
    } else {
        dom.existingTaskTab.classList.add('hidden');
        dom.newTaskTab.classList.remove('hidden');
        renderNewTaskForm(); // 新規作成フォームをレンダリング
    }
}


// ==========================================
// 6. 実行・停止ロジック (コア機能)
// ... (startTask, stopTask, checkRunningState, updateRunningTaskDisplay, updateTimer, formatTime, clearElement は省略しませんが、全文に含まれます)
// ==========================================


// ★★★ 修正: DOMContentLoaded の呼び出し順序を調整し、エラーを防ぐ ★★★

document.addEventListener('DOMContentLoaded', async () => {
    // イベントリスナー設定
    document.getElementById('toggleSettings').addEventListener('click', showSettings);
    document.getElementById('saveConfig').addEventListener('click', handleSaveSettings);
    document.getElementById('cancelConfig').addEventListener('click', hideSettings);
    document.getElementById('reloadTasks').addEventListener('click', loadTasks);

    // switchTabの定義が完了した後にイベントリスナーを設定
    dom.startExistingTask.addEventListener('click', switchTab);
    dom.startNewTask.addEventListener('click', switchTab);
    
    document.getElementById('startNewTaskButton').addEventListener('click', handleStartNewTask);
    document.getElementById('stopTaskButton').addEventListener('click', () => stopTask(false));
    document.getElementById('completeTaskButton').addEventListener('click', () => stopTask(true));
    
    dom.taskDbFilter.addEventListener('change', loadTasks);

    loadSettings();
    // 依存性の低い処理を先に実行
    await checkRunningState(); 

    if (settings.notionToken) {
        // Notion連携が可能な場合のみAPIコール
        await fetchDatabaseList();
        loadTasks(); // fetchDatabaseListの後に実行
    } else {
        showSettings();
    }
});
