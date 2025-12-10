// =========================================================================
// 設定とグローバル変数
// =========================================================================

// プロキシサーバーのURL (Vercelデプロイ後のURLに置き換えてください)
const PROXY_URL = 'https://notion-proxy-repo.vercel.app/api/proxy'; 

// ローカルストレージキー
const STORAGE_KEY = 'taskTrackerSettings';

// DOM要素の参照
const $settingsModal = document.getElementById('settingsView'); 
const $taskList = document.getElementById('taskList');
const $runningTaskContainer = document.getElementById('runningTaskContainer');
const $settingsBtn = document.getElementById('toggleSettings'); 
const $saveSettingsBtn = document.getElementById('saveConfig'); 
const $cancelConfigBtn = document.getElementById('cancelConfig'); 
const $startNewTaskButton = document.getElementById('startNewTaskButton'); 
const $reloadTasksBtn = document.getElementById('reloadTasks'); 
const $taskDbFilterSelect = document.getElementById('taskDbFilter');

// グローバル変数の定義
let NOTION_TOKEN = '';
let TOGGL_API_TOKEN = '';

// ★ カテゴリと部門は、新規タスク作成時に使うため、選択中のDBのものに更新されます
let CATEGORIES = [];
let DEPARTMENTS = [];

// ★ 現在選択されているDBのDATA_SOURCE_ID（単一DBのKPI/フォーム用）
let DATA_SOURCE_ID = ''; 
let TOGGL_WID = ''; 

// ★ 複数DB対応のための変数
let ALL_DB_CONFIGS = []; 

// ★★★ 状態管理用の変数 ★★★
// 'all' または 特定のDB ID。現在のタスク一覧の表示と新規タスクの作成先DBを決定します。
let CURRENT_VIEW_ID = 'all'; 

// CURRENT_DB_CONFIG は、CURRENT_VIEW_IDが単一DBのIDである場合にそのDB設定を保持します
let CURRENT_DB_CONFIG = null; 

// =========================================================================
// API通信ヘルパー
// =========================================================================

async function apiFetch(targetUrl, method, body, tokenKey, tokenValue) {
    const response = await fetch(PROXY_URL, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl, method, body, tokenKey, tokenValue })
    });

    if (response.status === 500) {
        const errorBody = await response.json();
        throw new Error(`Internal Server Error: ${errorBody.message}`);
    }
    if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `API Error (${response.status}): ${errorText}`;
        try {
            const errorJson = JSON.parse(errorText);
            if (errorJson.code) errorMessage = `API Error (${response.status}): ${errorJson.code} - ${errorJson.message}`;
        } catch (e) { /* JSONではない場合は無視 */ }
        throw new Error(errorMessage);
    }
    const responseText = await response.text();
    return responseText ? JSON.parse(responseText) : null;
}

async function apiCustomFetch(customEndpoint, params) {
    const response = await fetch(PROXY_URL, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customEndpoint, ...params })
    });

    if (response.status === 500) {
        const errorBody = await response.json();
        throw new Error(`Custom API Error (500): ${errorBody.message}`);
    }
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Custom API Error (${response.status}): ${errorText}`);
    }
    return response.json();
}


// =========================================================================
// 初期化と設定のロード
// =========================================================================

document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    console.log('アプリケーションを初期化中...');
    showLoading(); 

    const savedSettings = loadSettings();

    // Notion TokenとDB設定が存在するかチェック
    if (NOTION_TOKEN && ALL_DB_CONFIGS.length > 0) {
        
        // UIの初期化
        renderDbFilterOptions(); 
        
        // 最初のロード時、単一DBビューの場合はそのDBのプロパティをロード
        if (CURRENT_VIEW_ID !== 'all' && CURRENT_DB_CONFIG) {
            try {
                await loadDbProperties(CURRENT_DB_CONFIG.id); // DATA_SOURCE_ID, CATEGORIES, DEPARTMENTSをセット
            } catch (error) {
                console.warn('初期DBプロパティロード失敗:', error);
            }
        }
        
        displayCurrentDbTitle(CURRENT_DB_CONFIG ? CURRENT_DB_CONFIG.name : '統合ビュー');

        try {
            await checkRunningState(); 
            await loadTasksAndKpi(); 
        } catch (error) {
            console.error('初期化エラー:', error);
            alert(`初期化に失敗しました。エラー: ${error.message || '不明なエラー'}`);
        }
    } else {
        openSettingsModal();
    }
    hideLoading();
}

function loadSettings() {
    const savedSettings = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (savedSettings) {
        NOTION_TOKEN = savedSettings.notionToken || '';
        TOGGL_API_TOKEN = savedSettings.togglApiToken || '';
        TOGGL_WID = savedSettings.togglWid || '';
        ALL_DB_CONFIGS = savedSettings.allDbConfigs || [];
        
        // 最後に選択されていたビューIDをロード
        const currentViewId = savedSettings.currentViewId || 'all';
        CURRENT_VIEW_ID = currentViewId;
        
        // CURRENT_DB_CONFIGを更新 (新規タスク作成ターゲット用)
        CURRENT_DB_CONFIG = ALL_DB_CONFIGS.find(db => db.id === CURRENT_VIEW_ID) || null;
    }
    return savedSettings;
}

// DB IDを引数として、そのDBのカテゴリ、部門、データソースIDを取得・更新する関数
async function loadDbProperties(dbId) {
    console.log(`DB ${dbId} の設定をロード中...`);
    try {
        const configData = await apiCustomFetch('getConfig', {
            dbId: dbId, 
            tokenValue: NOTION_TOKEN
        });

        if (configData && configData.dataSourceId) {
            DATA_SOURCE_ID = configData.dataSourceId;
        } else {
            throw new Error("データソースIDを取得できませんでした。データベース設定または統合の権限を確認してください。");
        }

        CATEGORIES = configData.categories || [];
        DEPARTMENTS = configData.departments || [];
        
        console.log('DBプロパティロード完了');
        
    } catch (e) {
        console.error('DBプロパティロードエラー:', e);
        throw new Error(`DBプロパティロードエラー: ${e.message || 'TypeError: Failed to fetch'}`);
    }
}


// =========================================================================
// UIレンダリング
// =========================================================================

// メイン画面のタイトルにDB名を表示
function displayCurrentDbTitle(dbName) {
    const titleElement = document.querySelector('h2');
    if (titleElement) {
        titleElement.textContent = `Notion Toggl Timer - [${dbName}]`;
    }
}

function renderFormOptions() {
    const categoryContainer = document.getElementById('newCatContainer'); 
    const departmentDiv = document.getElementById('newDeptContainer');
    const targetDbDisplay = document.getElementById('targetDbDisplay');

    // 登録先DB表示の更新
    if (CURRENT_VIEW_ID === 'all') {
        targetDbDisplay.innerHTML = '登録先: **全てのタスク** ビューでは新規タスクを作成できません。';
        // フォームを無効化
        document.getElementById('startNewTaskButton').disabled = true;
    } else if (CURRENT_DB_CONFIG) {
        targetDbDisplay.innerHTML = `登録先: **${CURRENT_DB_CONFIG.name}**`;
        document.getElementById('startNewTaskButton').disabled = false;
    } else {
        targetDbDisplay.innerHTML = '登録先: **DBが選択されていません。** 設定を確認してください。';
        document.getElementById('startNewTaskButton').disabled = true;
    }

    // カテゴリ (Select)
    categoryContainer.innerHTML = '<select id="taskCategory"></select>';
    const taskCategorySelect = document.getElementById('taskCategory');
    taskCategorySelect.innerHTML = CATEGORIES.length > 0 ? '<option value="">-- 選択 --</option>' : '<option value="">-- DB設定なし --</option>';
    
    CATEGORIES.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        taskCategorySelect.appendChild(option);
    });

    // 部門 (Multi-Select)
    departmentDiv.innerHTML = '';
    if (DEPARTMENTS.length === 0) {
        departmentDiv.innerHTML = '<p style="font-size: 12px; color: #999;">DBに部門プロパティがありません。</p>';
    }
    DEPARTMENTS.forEach(dept => {
        const label = document.createElement('label');
        label.className = 'department-label';
        label.innerHTML = `
            <input type="checkbox" name="taskDepartment" value="${dept}"> 
            ${dept}
        `;
        departmentDiv.appendChild(label);
    });
}

// DBフィルタドロップダウンのレンダリング
function renderDbFilterOptions() {
    const $filterSelect = document.getElementById('taskDbFilter');
    if (!$filterSelect) return;

    $filterSelect.innerHTML = '';
    
    // 1. 「全てのタスク」オプションを追加
    let optionAll = document.createElement('option');
    optionAll.value = 'all';
    optionAll.textContent = '全てのタスク';
    $filterSelect.appendChild(optionAll);

    // 2. 登録されたDBオプションを追加
    ALL_DB_CONFIGS.forEach(db => {
        const option = document.createElement('option');
        option.value = db.id;
        option.textContent = `${db.name} (${db.id.substring(0, 8)}...)`;
        $filterSelect.appendChild(option);
    });

    // 3. 選択状態を復元
    $filterSelect.value = CURRENT_VIEW_ID;
}

async function loadTasksAndKpi() {
    await loadTaskList();
    await loadKpi();
}

// 特定のDBからタスクをロードするヘルパー関数
async function loadTasksFromSingleDb(dbConfig) {
    if (!dbConfig.dataSourceId) {
        // dataSourceIdがなければ設定を取得
        const configData = await apiCustomFetch('getConfig', {
            dbId: dbConfig.id, 
            tokenValue: NOTION_TOKEN
        });
        dbConfig.dataSourceId = configData.dataSourceId;
    }
    
    const targetUrl = `https://api.notion.com/v1/data_sources/${dbConfig.dataSourceId}/query`; 
    const filter = {
        property: 'ステータス',
        status: { does_not_equal: '完了' }
    };
    
    try {
        const response = await apiFetch(targetUrl, 'POST', { filter: filter }, 'notionToken', NOTION_TOKEN);
        // タスクにソースDB名をタグ付け
        response.results.forEach(task => task.sourceDbName = dbConfig.name); 
        return response.results;
    } catch (e) {
        console.warn(`DB "${dbConfig.name}" のタスクロードに失敗しました: ${e.message}`);
        return []; // 失敗時は空配列を返す
    }
}

// ★ 修正: loadTaskList をマルチDB対応に修正
async function loadTaskList() { 
    console.log(`タスク一覧をロード中 (ビュー: ${CURRENT_VIEW_ID})...`);
    
    if (!NOTION_TOKEN || ALL_DB_CONFIGS.length === 0) {
        $taskList.innerHTML = '<li><p>設定が必要です。</p></li>';
        return;
    }

    let allTasks = [];
    let dbConfigsToLoad = [];

    if (CURRENT_VIEW_ID === 'all') {
        dbConfigsToLoad = ALL_DB_CONFIGS;
    } else {
        const singleDb = ALL_DB_CONFIGS.find(db => db.id === CURRENT_VIEW_ID);
        if (singleDb) dbConfigsToLoad = [singleDb];
    }
        
    if (dbConfigsToLoad.length === 0) {
        $taskList.innerHTML = '<li><p>表示するDBが見つかりません。</p></li>';
        return;
    }

    try {
        showLoading();
        
        // 全ての対象DBからタスクを並行して取得
        const taskPromises = dbConfigsToLoad.map(dbConfig => loadTasksFromSingleDb(dbConfig));
        const results = await Promise.all(taskPromises);
        allTasks = results.flat();

        $taskList.innerHTML = '';
        if (allTasks.length === 0) {
            $taskList.innerHTML = '<li>現在のタスクはありません。</li>';
            return;
        }

        // タスク一覧のレンダリング
        allTasks.forEach(task => {
            const title = task.properties['タスク名']?.title?.[0]?.plain_text || '名前なしタスク';
            const category = task.properties['カテゴリ']?.select?.name || '未設定';
            const department = task.properties['部門']?.multi_select?.map(d => d.name).join(', ') || '未設定';
            const status = task.properties['ステータス']?.status?.name || '未設定';
            const pageId = task.id;
            const notionUrl = task.url;
            const sourceDbName = task.sourceDbName || '不明なDB'; 

            const listItem = document.createElement('li');
            listItem.className = 'task-item';
            listItem.innerHTML = `
                <div class="task-info">
                    <span class="task-title">${title}</span>
                    <span class="task-meta">
                        DB: ${sourceDbName} | [${category}] / [${department}] - ステータス: ${status}
                    </span>
                </div>
                <div class="task-actions">
                    <a href="${notionUrl}" target="_blank" class="btn btn-blue btn-sm" style="width:auto; margin-right:5px;">Notionで開く</a>
                    <button class="btn btn-green btn-sm" data-page-id="${pageId}" style="width:auto;">完了</button>
                </div>
            `;
            listItem.querySelector('.btn-green').addEventListener('click', (e) => {
                markTaskCompleted(e.target.dataset.pageId);
            });
            $taskList.appendChild(listItem);
        });

    } catch (e) {
        $taskList.innerHTML = `<li><p class="error-message">タスク一覧のロードに失敗しました。エラー: ${e.message}</p></li>`;
        console.error('タスク一覧ロードエラー:', e);
    } finally {
        hideLoading();
    }
}

async function loadKpi() {
    console.log('KPIをロード中...');
    
    // KPIはCURRENT_DB_CONFIG（単一DB）がある場合のみ表示
    if (!CURRENT_DB_CONFIG || CURRENT_VIEW_ID === 'all' || !DATA_SOURCE_ID) {
        document.getElementById('kpiWeek').textContent = '--';
        document.getElementById('kpiMonth').textContent = '--';
        document.getElementById('kpiCategoryContainer').innerHTML = '単一DB選択時に表示されます。';
        return; 
    }
    
    try {
        const kpiData = await apiCustomFetch('getKpi', {
            dataSourceId: DATA_SOURCE_ID, // loadDbPropertiesでセットされたDATA_SOURCE_IDを使用
            tokenValue: NOTION_TOKEN
        });

        const formatMins = (mins) => {
            const h = Math.floor(mins / 60);
            const m = mins % 60;
            return `${h}h ${m}m`;
        };
        
        document.getElementById('kpiWeek').textContent = formatMins(kpiData.totalWeekMins);
        document.getElementById('kpiMonth').textContent = formatMins(kpiData.totalMonthMins);

        let categoryListHtml = '<ul>';
        const sortedCategories = Object.entries(kpiData.categoryWeekMins || {}).sort(([, a], [, b]) => b - a);
        
        sortedCategories.forEach(([category, mins]) => {
            categoryListHtml += `<li>${category}: ${formatMins(mins)}</li>`;
        });
        categoryListHtml += '</ul>';

        document.getElementById('kpiCategoryContainer').innerHTML = categoryListHtml || 'データなし';

    } catch (e) {
        document.getElementById('kpiCategoryContainer').innerHTML = `<p class="error-message">KPIロードエラー: ${e.message}</p>`;
        console.error('KPIロードエラー:', e);
    }
}


// =========================================================================
// 複数DB管理と選択UIの関数
// =========================================================================

function renderDbInputs() {
    const $container = document.getElementById('dbListContainer');
    if (!$container) return;

    $container.innerHTML = '';
    
    ALL_DB_CONFIGS.forEach((db, index) => {
        const div = document.createElement('div');
        div.className = 'db-entry';
        div.style.marginBottom = '15px';
        div.innerHTML = `
            <h4 style="margin-top: 0; margin-bottom: 5px;">DB ${index + 1}</h4>
            <label style="font-size: 12px; display: block;">DB名:</label>
            <input type="text" class="confDbName" value="${db.name || ''}" placeholder="例: 仕事用タスクDB">
            <label style="font-size: 12px; display: block;">Database ID:</label>
            <input type="text" class="confDbId" value="${db.id || ''}" placeholder="32桁のDB ID">
            <button class="removeDbEntry btn-gray" data-index="${index}" style="width: auto; padding: 5px 10px; font-size: 12px; margin-top: 5px;">削除</button>
            <hr style="border: 0; border-top: 1px dashed #ddd; margin-top: 10px;">
        `;
        $container.appendChild(div);
    });

    // 削除ボタンのリスナー設定
    document.querySelectorAll('.removeDbEntry').forEach(button => {
        button.addEventListener('click', (e) => removeDbEntry(e.target.dataset.index));
    });
}

function removeDbEntry(index) {
    ALL_DB_CONFIGS.splice(index, 1);
    renderDbInputs(); // UIを再描画
}

function addDbEntry() {
    // プレースホルダーとして空のエントリを追加
    ALL_DB_CONFIGS.push({ name: '', id: '' }); 
    renderDbInputs();
}

// (renderDbSelectOptions 関数は削除されました - taskDbFilterで代用)

// =========================================================================
// アクション処理
// =========================================================================

async function createNotionTask(e) {
    e.preventDefault();
    
    const title = document.getElementById('newTaskTitle').value;
    const category = document.getElementById('taskCategory')?.value; 
    const selectedDepartments = Array.from(document.querySelectorAll('#newDeptContainer input[name="taskDepartment"]:checked'))
                                     .map(checkbox => checkbox.value);
    
    if (!title || !category) {
        alert('タスク名とカテゴリは必須です。');
        return;
    }
    
    // CURRENT_DB_CONFIGを使用して、どのDBに作成するかを確認
    if (!CURRENT_DB_CONFIG || CURRENT_VIEW_ID === 'all') {
        alert('エラー: タスクを登録するDBが選択されていません。「全てのタスク」ビューでは新規タスクを作成できません。単一のDBを選択してください。');
        return;
    }
    
    const deptProps = selectedDepartments.map(d => ({ name: d }));
    const pageProperties = {
        'タスク名': { title: [{ type: 'text', text: { content: title } }] },
        'カテゴリ': { select: { name: category } },
        '部門': { multi_select: deptProps },
        'ステータス': { status: { name: 'ToDo' } }
    };
    
    const parentObject = {
        type: 'database_id', 
        database_id: CURRENT_DB_CONFIG.id // 選択中のDB IDを使用
    };

    const targetUrl = 'https://api.notion.com/v1/pages';
    
    try {
        showLoading();
        await apiFetch(targetUrl, 'POST', { parent: parentObject, properties: pageProperties }, 'notionToken', NOTION_TOKEN);
        alert(`タスクが正常にDB「${CURRENT_DB_CONFIG.name}」に作成されました！`);
        document.getElementById('newTaskTitle').value = ''; 
        if (document.getElementById('taskCategory')) document.getElementById('taskCategory').value = ''; 
        document.querySelectorAll('#newDeptContainer input[name="taskDepartment"]:checked').forEach(cb => cb.checked = false);
        await loadTasksAndKpi();
    } catch (e) {
        alert(`タスク作成に失敗しました。\nエラー: ${e.message}`);
        console.error('タスク作成エラー:', e);
    } finally {
        hideLoading();
    }
}

async function markTaskCompleted(pageId) {
    if (confirm('このタスクを「完了」にしますか？')) {
        const targetUrl = `https://api.notion.com/v1/pages/${pageId}`;
        const updateProperties = {
            'ステータス': { status: { name: '完了' } },
            '完了日': { date: { start: new Date().toISOString().split('T')[0] } } 
        };

        try {
            showLoading();
            await apiFetch(targetUrl, 'PATCH', { properties: updateProperties }, 'notionToken', NOTION_TOKEN);
            alert('タスクを完了にしました。');
            await loadTasksAndKpi();
        } catch (e) {
            alert(`タスク完了処理に失敗しました。\nエラー: ${e.message}`);
            console.error('タスク完了エラー:', e);
        } finally {
            hideLoading();
        }
    }
}


// =========================================================================
// Toggl 連携
// =========================================================================

async function checkRunningState() {
    if (!TOGGL_API_TOKEN) {
        document.getElementById('runningTaskTitle').textContent = 'Toggl連携なし';
        $runningTaskContainer.classList.remove('hidden'); 
        return;
    }
    
    try {
        const runningEntry = await getTogglRunningEntry();
        
        if (runningEntry) {
            const description = runningEntry.description || 'タイトルなし';
            document.getElementById('runningTaskTitle').textContent = description;
            document.getElementById('runningStartTime').textContent = new Date(runningEntry.start).toLocaleTimeString();
            $runningTaskContainer.classList.remove('hidden');
            // TODO: タイマー更新ロジックを実装
        } else {
            document.getElementById('runningTaskTitle').textContent = '🔵 実行中のタスクはありません';
            $runningTaskContainer.classList.add('hidden'); // 非実行時はコンテナを隠す
        }
    } catch (e) {
        document.getElementById('runningTaskTitle').textContent = `Toggl接続エラー: ${e.message}`;
        console.error('Toggl連携エラー:', e);
    }
}

async function getTogglRunningEntry() {
    const targetUrl = 'https://api.track.toggl.com/api/v9/me/time_entries/current';
    const response = await apiFetch(targetUrl, 'GET', null, 'togglApiToken', TOGGL_API_TOKEN);
    return response;
}


// =========================================================================
// UIイベントリスナー
// =========================================================================

if ($startNewTaskButton) {
    $startNewTaskButton.addEventListener('click', createNotionTask);
} 

if ($settingsBtn) {
    $settingsBtn.addEventListener('click', openSettingsModal);
} 

if ($saveSettingsBtn) {
    $saveSettingsBtn.addEventListener('click', saveSettings);
} 

if ($cancelConfigBtn) {
    $cancelConfigBtn.addEventListener('click', () => {
        $settingsModal.classList.add('hidden');
    });
} 

if ($reloadTasksBtn) {
    $reloadTasksBtn.addEventListener('click', loadTasksAndKpi);
} 

// ★★★ 修正: taskDbFilter 変更リスナー ★★★
if ($taskDbFilterSelect) {
    $taskDbFilterSelect.addEventListener('change', async function() {
        const newViewId = this.value;
        CURRENT_VIEW_ID = newViewId;
        
        // 1. CURRENT_DB_CONFIGを更新 (新規タスク作成ターゲット用)
        CURRENT_DB_CONFIG = ALL_DB_CONFIGS.find(db => db.id === newViewId) || null;
        
        // 2. 選択状態を保存
        const currentSettings = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
        currentSettings.currentViewId = newViewId;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSettings));
        
        // 3. フォームオプション (カテゴリ/部門) を更新
        if (CURRENT_DB_CONFIG) {
            try {
                await loadDbProperties(CURRENT_DB_CONFIG.id); // DATA_SOURCE_ID, CATEGORIES, DEPARTMENTSを更新
                renderFormOptions();
                displayCurrentDbTitle(CURRENT_DB_CONFIG.name);
            } catch (e) {
                alert(`DB設定のロードに失敗しました。新規タスクの作成はできません。\nエラー: ${e.message}`);
                CATEGORIES = []; DEPARTMENTS = []; renderFormOptions();
                displayCurrentDbTitle('統合ビュー');
            }
        } else {
             // 'All Tasks'選択時: フォームオプションをクリア
            CATEGORIES = []; DEPARTMENTS = []; renderFormOptions();
            displayCurrentDbTitle('統合ビュー');
        }

        // 4. タスク一覧とKPIをロード
        loadTasksAndKpi(); 
    });
}

// タスクモード切り替えリスナー (既存タスク / 新規タスク)
const $taskModeRadios = document.querySelectorAll('input[name="taskMode"]');
const $existingTaskContainer = document.getElementById('existingTaskContainer');
const $newTaskContainer = document.getElementById('newTaskContainer');

$taskModeRadios.forEach(radio => {
    radio.addEventListener('change', function() {
        if (this.value === 'new') {
            $existingTaskContainer.classList.add('hidden');
            $newTaskContainer.classList.remove('hidden');
        } else {
            $existingTaskContainer.classList.remove('hidden');
            $newTaskContainer.classList.add('hidden');
        }
    });
});

// DB追加ボタンのリスナー
const $addDbEntryBtn = document.getElementById('addDbEntry');
if ($addDbEntryBtn) {
    $addDbEntryBtn.addEventListener('click', addDbEntry);
}

// =========================================================================
// 設定モーダル関数
// =========================================================================

function saveSettings() {
    const notionToken = document.getElementById('confNotionToken').value;
    const togglApiToken = document.getElementById('confTogglToken').value;
    const togglWid = document.getElementById('confTogglWid').value;
    
    // 複数DB設定を取得
    const newAllDbConfigs = [];
    const dbNames = document.querySelectorAll('.confDbName');
    const dbIds = document.querySelectorAll('.confDbId');

    for (let i = 0; i < dbNames.length; i++) {
        // IDと名前が両方あるものだけを保存
        if (dbIds[i].value && dbNames[i].value) {
            newAllDbConfigs.push({
                name: dbNames[i].value,
                id: dbIds[i].value
            });
        }
    }
    
    if (!notionToken || newAllDbConfigs.length === 0) {
        alert('Notionトークンと少なくとも一つのDBの設定（名前とID）は必須です。');
        return;
    }

    // 以前のCURRENT_VIEW_IDを維持するか、最初のDB IDにリセット
    let newCurrentViewId = CURRENT_VIEW_ID;
    const currentDbStillExists = newAllDbConfigs.some(db => db.id === newCurrentViewId);
    if (newCurrentViewId !== 'all' && !currentDbStillExists) {
        // 選択中のDBが削除されたら 'all' にリセット
        newCurrentViewId = 'all'; 
    } else if (newCurrentViewId === 'all' && newAllDbConfigs.length === 0) {
        newCurrentViewId = null; // DBが全くない場合
    } else if (!newCurrentViewId && newAllDbConfigs.length > 0) {
        newCurrentViewId = newAllDbConfigs[0].id; // DBが追加された場合など
    }


    const settings = { 
        notionToken, 
        togglApiToken,
        togglWid,
        allDbConfigs: newAllDbConfigs,
        currentViewId: newCurrentViewId
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    
    alert('設定を保存しました。アプリケーションをリロードします。');
    $settingsModal.classList.add('hidden');
    location.reload(); 
}

function openSettingsModal() {
    document.getElementById('confNotionToken').value = NOTION_TOKEN;
    document.getElementById('confTogglToken').value = TOGGL_API_TOKEN;
    document.getElementById('confTogglWid').value = TOGGL_WID;
    
    // 設定画面を開く際にDB入力フィールドをレンダリング
    renderDbInputs(); 
    
    $settingsModal.classList.remove('hidden'); 
}


// =========================================================================
// ローディングUI
// =========================================================================

function showLoading() {
    document.body.style.cursor = 'wait';
    document.body.style.pointerEvents = 'none'; // 操作不可にする
}

function hideLoading() {
    document.body.style.cursor = 'default';
    document.body.style.pointerEvents = 'auto';
}
