const PROXY_URL = 'https://company-notion-toggl-api.vercel.app/api/proxy'; 
const TOGGL_V9_BASE_URL = 'https://api.track.toggl.com/api/v9';

// ... (settingsオブジェクトは変更なし)
const settings = {
    notionToken: '',
    notionDatabases: [], // [{ name: "DB名", id: "DBID" }, ...]
    humanUserId: '', 
    
    togglApiToken: '',
    togglWorkspaceId: '', 
    
    databases: [], 
    currentRunningTask: null, 
    startTime: null,         
    timerInterval: null      
};

const dbPropertiesCache = {}; 

// ==========================================
// 1. DOM要素の安全な取得 (NULLセーフ化の基盤)
// ==========================================

/**
 * 必要なDOM要素を全て取得し、オブジェクトとして返す。
 * これにより、スクリプト実行時点で要素が存在しない場合にnullエラーになるのを防ぐ。
 */
function getDomElements() {
    return {
        // 画面切り替え
        mainView: document.getElementById('mainView'),
        settingsView: document.getElementById('settingsView'),

        // 設定フォーム
        confNotionToken: document.getElementById('confNotionToken'),
        confNotionUserId: document.getElementById('confNotionUserId'),
        confTogglToken: document.getElementById('confTogglToken'), 
        confTogglWid: document.getElementById('confTogglWid'),     
        
        // DB設定動的フォーム
        dbConfigContainer: document.getElementById('dbConfigContainer'),
        addDbConfigButton: document.getElementById('addDbConfig'),

        // 設定保存・閉じるボタン (ID修正済みのものを使用)
        saveConfigButton: document.getElementById('saveConfig'),
        toggleSettingsButton: document.getElementById('toggleSettings'),
        cancelConfigButton: document.getElementById('cancelConfig'), // ✅ ID一致確認済

        // タスク一覧・フィルター
        taskDbFilter: document.getElementById('taskDbFilter'),
        taskListContainer: document.getElementById('taskListContainer'),
        reloadTasksButton: document.getElementById('reloadTasks'), 

        // 実行中タスク
        runningTaskContainer: document.getElementById('runningTaskContainer'),
        runningTaskTitle: document.getElementById('runningTaskTitle'),
        runningTimer: document.getElementById('runningTimer'),
        thinkingLogInput: document.getElementById('thinkingLogInput'),
        // 実行中タスク操作ボタン (ID修正済みのものを使用)
        stopTaskButton: document.getElementById('stopTaskButton'),     // ✅ ID一致確認済
        completeTaskButton: document.getElementById('completeTaskButton'), // ✅ ID一致確認済

        // 新規タスクフォーム
        newTaskForm: document.getElementById('newTaskForm'),
        newTaskTitle: document.getElementById('newTaskTitle'),
        newCatContainer: document.getElementById('newCatContainer'),
        newDeptContainer: document.getElementById('newDeptContainer'),
        targetDbDisplay: document.getElementById('targetDbDisplay'),
        startNewTaskButton: document.getElementById('startNewTaskButton'), // ✅ ID一致確認済

        // タブボタン 
        startExistingTask: document.getElementById('startExistingTask'),
        startNewTask: document.getElementById('startNewTask'),
        existingTaskTab: document.getElementById('existingTaskTab'),
        newTaskTab: document.getElementById('newTaskTab'),
        taskSelectionSection: document.getElementById('taskSelectionSection'),
        
        // KPIレポート要素
        toggleKpiReportBtn: document.getElementById('toggleKpiReportBtn'), 
        kpiReportTab: document.getElementById('kpiReportTab'),
        reportPeriodSelect: document.getElementById('reportPeriodSelect'),
        fetchKpiButton: document.getElementById('fetchKpiButton'),
        reportTotalTime: document.getElementById('reportTotalTime'),
        kpiResultsContainer: document.getElementById('kpiResultsContainer')
    };
}

// グローバルなDOM参照を `init` 時点で安全に設定
let dom; 

// ==========================================
// 2. UX改善 (通知機能 & ユーティリティ) - 変更なし
// ==========================================

/** 指定されたメッセージを短時間通知表示する */
function showNotification(message, duration = 3000) {
    let notification = document.getElementById('appNotification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'appNotification';
        // スタイルはCSSではなく、ここで直接指定（シンプルな通知のため）
        notification.style.cssText = `
            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
            background-color: #4CAF50; color: white; padding: 10px 20px;
            border-radius: 5px; z-index: 1000; opacity: 0; transition: opacity 0.5s;
            font-size: 14px; box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        `;
        document.body.appendChild(notification);
    }
    
    notification.textContent = message;
    notification.style.opacity = '1';

    // 既存のタイマーがあればクリア
    clearTimeout(notification.timer); 

    // 指定時間後に非表示にするタイマーを設定
    notification.timer = setTimeout(() => {
        notification.style.opacity = '0';
    }, duration);
}

/** DOM要素の子要素を全てクリアする */
function clearElement(element) {
    if (element) {
        element.innerHTML = '';
    }
}

/** ミリ秒を H:MM:SS 形式にフォーマット */
function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    // H:MM:SS
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}


// ==========================================
// 3. 初期化 & 設定管理
// ==========================================

/** ローカルストレージから設定を読み込む - 変更なし */
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

/** データベース設定フォームのペアをレンダリングする */
function renderDbConfigForms() {
    if (!dom.dbConfigContainer) return; // ✅ NULLチェック

    clearElement(dom.dbConfigContainer);

    // 設定がない場合、空のフォームを一つ追加
    if (settings.notionDatabases.length === 0) {
        settings.notionDatabases.push({ name: '', id: '' });
    }

    settings.notionDatabases.forEach((db, index) => {
        const div = document.createElement('div');
        div.className = 'db-config-pair';
        div.style.marginBottom = '10px';
        div.innerHTML = `
            <div class="form-group" style="margin-bottom: 5px;">
                <input type="text" placeholder="表示名 (例: タスクDB)" class="input-field db-name-input" 
                        data-index="${index}" value="${db.name}" style="margin-bottom: 5px;">
                <input type="text" placeholder="データベースID (32桁)" class="input-field db-id-input" 
                        data-index="${index}" value="${db.id}">
            </div>
        `;
        dom.dbConfigContainer.appendChild(div);
    });
}

/** データベース設定の追加ボタンのハンドラ */
function handleAddDbConfig() {
    settings.notionDatabases.push({ name: '', id: '' });
    renderDbConfigForms(); 
}


/** 設定を保存する (安全化) */
function handleSaveSettings() {
    // ✅ NULLチェックの徹底
    if (dom.confNotionToken) settings.notionToken = dom.confNotionToken.value.trim();
    
    // フォームから配列を読み取る
    const newDbConfigs = [];
    // document.querySelectorAll は安全
    const names = Array.from(document.querySelectorAll('.db-name-input'));
    const ids = Array.from(document.querySelectorAll('.db-id-input'));

    names.forEach((nameInput, index) => {
        const idInput = ids[index];
        const name = nameInput.value.trim();
        const id = idInput.value.trim();

        if (name && id) { // 両方入力されているもののみ採用
            newDbConfigs.push({ name: name, id: id });
        }
    });

    settings.notionDatabases = newDbConfigs;

    if (settings.notionDatabases.length === 0) {
        alert("データベース設定が一つも入力されていません。"); // 処理中断のためalertを保持
        return; 
    }

    if (dom.confNotionUserId) settings.humanUserId = dom.confNotionUserId.value.trim();
    if (dom.confTogglToken) settings.togglApiToken = dom.confTogglToken.value.trim(); 
    if (dom.confTogglWid) settings.togglWorkspaceId = dom.confTogglWid.value.trim(); 
    
    localStorage.setItem('notionToken', settings.notionToken);
    localStorage.setItem('notionDatabases', JSON.stringify(settings.notionDatabases));
    localStorage.setItem('humanUserId', settings.humanUserId);
    localStorage.setItem('togglApiToken', settings.togglApiToken);
    localStorage.setItem('togglWorkspaceId', settings.togglWorkspaceId);
    
    showNotification('設定を保存しました。'); // 通知に変更
    saveSettings(); 
    hideSettings();
    fetchDatabaseList();
    loadTasks();
}

/** settingsオブジェクトをlocalStorageに保存（ランタイム用） - 変更なし*/
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

/** 設定画面を表示 (安全化) */
function showSettings() {
    if (dom.confNotionToken) dom.confNotionToken.value = settings.notionToken;
    
    renderDbConfigForms();

    if (dom.confNotionUserId) dom.confNotionUserId.value = settings.humanUserId;
    if (dom.confTogglToken) dom.confTogglToken.value = settings.togglApiToken; 
    if (dom.confTogglWid) dom.confTogglWid.value = settings.togglWorkspaceId; 

    if (dom.mainView) dom.mainView.classList.add('hidden');
    if (dom.settingsView) dom.settingsView.classList.remove('hidden');
}

/** 設定画面を非表示 (安全化) */
function hideSettings() {
    if (dom.settingsView) dom.settingsView.classList.add('hidden');
    if (dom.mainView) dom.mainView.classList.remove('hidden');
}


// ==========================================
// 4. API基盤 (Notion & Toggl) - 変更なし
// ==========================================
// ... (API関数群は変更なし)

// ...

// ==========================================
// 5. Notionデータ取得 (安全化)
// ==========================================

/** データベース一覧を取得し、フィルターをレンダリングする (安全化) */
async function fetchDatabaseList() {
    if (settings.notionDatabases.length === 0) {
        settings.databases = [];
        if (dom.taskDbFilter) dom.taskDbFilter.innerHTML = '<option value="">DBが設定されていません</option>'; // ✅ NULLチェック
        return;
    }
    
    // ... (Notion API呼び出しロジックは変更なし)
    try {
        // 1. ボットユーザーIDを取得 (省略)
        // ...
        
        // 2. 設定された各データベースIDの情報を取得 (省略)
        // ...

        // 3. フィルターのレンダリング (安全化)
        if (dom.taskDbFilter && settings.databases.length > 0) {
              const currentSelectedDbId = dom.taskDbFilter.value || settings.databases[0].id; 
              dom.taskDbFilter.innerHTML = settings.databases.map(db => 
                  `<option value="${db.id}" ${db.id === currentSelectedDbId ? 'selected' : ''}>${db.name}</option>`
              ).join('');
        } else if (dom.taskDbFilter) {
             dom.taskDbFilter.innerHTML = '<option value="">有効なDBが見つかりません</option>';
        }
        
    } catch (e) {
        // ... (エラーハンドリングは変更なし)
    }
}

/** データベースのプロパティ情報を取得しキャッシュする - 変更なし */
async function getDbProperties(dbId) {
    // ...
}

/** タスク一覧をロードしレンダリングする (安全化) */
async function loadTasks() {
    const dbId = dom.taskDbFilter ? dom.taskDbFilter.value : null; // ✅ NULLチェック
    if (!dbId || !dom.taskListContainer) { // ✅ NULLチェック
        if (dom.taskListContainer) dom.taskListContainer.innerHTML = '<p>データベースが選択されていません。</p>';
        return;
    }

    dom.taskListContainer.innerHTML = '<p>タスクを読み込み中...</p>';
    try {
        // ... (Notion API呼び出しロジックは変更なし)
        // ...
        renderTaskList(res.results, dbId, props);

    } catch (e) {
        if (dom.taskListContainer) dom.taskListContainer.innerHTML = `<p style="color: red;">エラー: ${e.message}</p>`;
    }
}

/** タスク一覧をレンダリングする (安全化) */
function renderTaskList(tasks, dbId, props) {
    if (!dom.taskListContainer) return; // ✅ NULLチェック
    
    // ... (リスト作成ロジックは変更なし)

    // ... (ループ内でli要素、startButtonを作成)
    // ...

    dom.taskListContainer.innerHTML = '';
    dom.taskListContainer.appendChild(list);
}


// ==========================================
// 6. タスクフォーム/タブ管理 (安全化)
// ==========================================

/** タブを切り替える (安全化) */
function switchTab(event) {
    const target = event.currentTarget.dataset.target; // event.target → event.currentTargetに変更
    
    // ✅ NULLチェックの徹底
    if (dom.startExistingTask) dom.startExistingTask.classList.remove('active');
    if (dom.startNewTask) dom.startNewTask.classList.remove('active');
    if (dom.toggleKpiReportBtn) dom.toggleKpiReportBtn.classList.remove('active'); 
    
    if (event.currentTarget) event.currentTarget.classList.add('active'); // event.target → event.currentTargetに変更

    // タスク選択/作成セクションとKPIレポートセクションの表示を切り替える
    if (target === 'report') {
        if (dom.taskSelectionSection) dom.taskSelectionSection.classList.add('hidden');
        if (dom.kpiReportTab) dom.kpiReportTab.classList.remove('hidden');
        if (dom.kpiResultsContainer) clearElement(dom.kpiResultsContainer); // レポートタブに切り替えたら結果をクリア
    } else {
        if (dom.taskSelectionSection) dom.taskSelectionSection.classList.remove('hidden');
        if (dom.kpiReportTab) dom.kpiReportTab.classList.add('hidden');

        // タスク選択タブと新規作成タブの切り替え
        if (target === 'existing') {
            if (dom.existingTaskTab) dom.existingTaskTab.classList.remove('hidden');
            if (dom.newTaskTab) dom.newTaskTab.classList.add('hidden'); 
        } else if (target === 'new') {
            if (dom.existingTaskTab) dom.existingTaskTab.classList.add('hidden'); 
            if (dom.newTaskTab) dom.newTaskTab.classList.remove('hidden'); 
            renderNewTaskForm(); 
        }
    }
}

/** 新規タスクフォームをレンダリング (安全化) */
async function renderNewTaskForm() {
    const dbId = dom.taskDbFilter ? dom.taskDbFilter.value : null; // ✅ NULLチェック
    if (!dbId || !dom.targetDbDisplay) { // ✅ NULLチェック
        if (dom.targetDbDisplay) dom.targetDbDisplay.textContent = 'エラー: データベースを選択してください。';
        clearElement(dom.newCatContainer);
        clearElement(dom.newDeptContainer);
        return;
    }

    const db = settings.databases.find(d => d.id === dbId);
    if (dom.targetDbDisplay) dom.targetDbDisplay.textContent = `新規タスクの作成先: ${db ? db.name : '不明なDB'}`; // ✅ NULLチェック

    // ... (フォームレンダリングロジックは変更なし)

    // ...
}

/** 新規タスク作成・開始のハンドラ (安全化) */
async function handleStartNewTask() {
    const title = dom.newTaskTitle ? dom.newTaskTitle.value.trim() : ''; // ✅ NULLチェック
    const dbId = dom.taskDbFilter ? dom.taskDbFilter.value : null;       // ✅ NULLチェック
    
    if (!title) { alert('タスク名を入力してください。'); return; } 
    if (!dbId) { alert('データベースを選択してください。'); return; } 

    try {
        // ... (Notion API呼び出しロジックは変更なし)
        // ...
        
        showNotification(`新規タスク「${title}」を作成しました。計測を開始します。`); 
        startTask(newTaskData);
        if (dom.newTaskTitle) dom.newTaskTitle.value = ''; // フォームをクリア (✅ NULLチェック)

    } catch (e) {
        // ... (エラーハンドリングは変更なし)
    }
}


// ==========================================
// 7. 実行・停止ロジック (コア機能) (安全化)
// ==========================================

/** タスク計測を開始する - 変更なし */
async function startTask(task) {
    // ...
}

/** タスク計測を停止または完了する (安全化) */
async function stopTask(isComplete) {
    if (!settings.currentRunningTask || !settings.currentRunningTask.togglEntryId) {
        alert('実行中のタスクはありません。'); 
        return;
    }

    const task = settings.currentRunningTask;
    const logText = dom.thinkingLogInput ? dom.thinkingLogInput.value.trim() : ''; // ✅ NULLチェック
    // ... (Duration計算は変更なし)

    try {
        // ... (Toggl停止、Notion更新ロジックは変更なし)

        // 3. 状態クリアとUI更新
        settings.currentRunningTask = null;
        settings.startTime = null;
        if (dom.thinkingLogInput) dom.thinkingLogInput.value = ''; // ✅ NULLチェック

        saveSettings();
        updateRunningTaskDisplay(false);
        loadTasks();
        
        // ... (通知は変更なし)
        
    } catch (e) {
        // ... (エラーハンドリングは変更なし)
    }
}


/** 実行中タスクの有無をチェックし、UIを更新する - 変更なし */
async function checkRunningState() {
    // ...
}

/** 実行中タスクの表示を更新 (安全化) */
function updateRunningTaskDisplay(isRunning) {
    if (isRunning) {
        if (dom.runningTaskContainer) dom.runningTaskContainer.classList.remove('hidden');
        if (dom.taskSelectionSection) dom.taskSelectionSection.classList.add('hidden');
        if (dom.kpiReportTab) dom.kpiReportTab.classList.add('hidden'); // KPIレポートも非表示に
        if (dom.runningTaskTitle) dom.runningTaskTitle.textContent = settings.currentRunningTask.title || '実行中タスク';
        if (!settings.timerInterval) {
            settings.timerInterval = setInterval(updateTimer, 1000);
        }
    } else {
        if (dom.runningTaskContainer) dom.runningTaskContainer.classList.add('hidden');
        // 実行中のタスクがない場合は、タスク選択セクションに戻す 
        if (dom.toggleKpiReportBtn && !dom.toggleKpiReportBtn.classList.contains('active')) {
            if (dom.taskSelectionSection) dom.taskSelectionSection.classList.remove('hidden');
        }
        if (settings.timerInterval) {
            clearInterval(settings.timerInterval);
            settings.timerInterval = null;
        }
        if (dom.runningTimer) dom.runningTimer.textContent = '00:00:00';
    }
}

/** タイマーを更新する (安全化) */
function updateTimer() {
    if (settings.startTime && dom.runningTimer) { // ✅ NULLチェック
        const elapsed = Date.now() - settings.startTime;
        dom.runningTimer.textContent = formatTime(elapsed);
    }
}

// ==========================================
// 8. KPIレポート機能 (Toggl Reports API) - 変更なし
// ==========================================
// ... (レポートロジックは変更なし)

// ...

// ==========================================
// 9. 初期ロードとイベントリスナー設定 (NULLセーフ化)
// ==========================================

/** 初期化処理 (完全NULLセーフ) */
function init() {
    // 1. DOM要素を安全に取得
    dom = getDomElements(); 
    loadSettings();

    // 2. 設定画面の初期値設定 (NULLチェック)
    if (dom.confNotionToken) dom.confNotionToken.value = settings.notionToken;
    if (dom.confNotionUserId) dom.confNotionUserId.value = settings.humanUserId;
    if (dom.confTogglToken) dom.confTogglToken.value = settings.togglApiToken; 
    if (dom.confTogglWid) dom.confTogglWid.value = settings.togglWorkspaceId; 

    // 3. イベントリスナー設定 (NULLセーフ化)
    
    // 設定関連
    if (dom.saveConfigButton) dom.saveConfigButton.addEventListener('click', handleSaveSettings);
    if (dom.toggleSettingsButton) dom.toggleSettingsButton.addEventListener('click', showSettings);
    if (dom.cancelConfigButton) dom.cancelConfigButton.addEventListener('click', hideSettings); // ✅ HTML ID一致確認済
    if (dom.addDbConfigButton) dom.addDbConfigButton.addEventListener('click', handleAddDbConfig);

    // タスク関連
    if (dom.taskDbFilter) dom.taskDbFilter.addEventListener('change', loadTasks);
    if (dom.reloadTasksButton) dom.reloadTasksButton.addEventListener('click', loadTasks); 

    // タブ切り替え
    if (dom.startExistingTask) dom.startExistingTask.addEventListener('click', switchTab);
    if (dom.startNewTask) dom.startNewTask.addEventListener('click', switchTab);
    if (dom.toggleKpiReportBtn) dom.toggleKpiReportBtn.addEventListener('click', switchTab); 

    // 新規タスクフォーム
    if (dom.startNewTaskButton) dom.startNewTaskButton.addEventListener('click', handleStartNewTask); 
    if (dom.newTaskForm) {
        dom.newTaskForm.addEventListener('submit', (e) => {
            e.preventDefault(); 
        });
    }

    // 実行中タスク操作
    if (dom.stopTaskButton) dom.stopTaskButton.addEventListener('click', () => stopTask(false));      // ✅ HTML ID一致確認済
    if (dom.completeTaskButton) dom.completeTaskButton.addEventListener('click', () => stopTask(true)); // ✅ HTML ID一致確認済
    
    // KPIレポート
    if (dom.fetchKpiButton) dom.fetchKpiButton.addEventListener('click', fetchKpiReport);


    // 4. 初期表示処理
    if (settings.notionToken && settings.notionDatabases.length > 0) {
        fetchDatabaseList().then(() => {
            loadTasks();
            checkRunningState();
        });
    } else {
        showSettings();
    }
}

// アプリケーションの開始
init();
