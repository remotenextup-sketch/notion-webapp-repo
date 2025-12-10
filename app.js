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

// グローバル変数の定義
let NOTION_TOKEN = '';
let TOGGL_API_TOKEN = '';
let CATEGORIES = [];
let DEPARTMENTS = [];
let DATA_SOURCE_ID = ''; 
let TOGGL_WID = ''; 

// ★★★ プロジェクトフィルタのために追加した変数 ★★★
let ALL_PROJECTS = []; 
// ★★★ ここまで追加 ★★★

// ★ 複数DB対応のための変数
let ALL_DB_CONFIGS = []; 
let CURRENT_DB_CONFIG = null; // {name: '...', id: '...'}

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

    loadSettings();

    // Notion Tokenと現在選択中のDB IDが存在するかチェック
    if (NOTION_TOKEN && CURRENT_DB_CONFIG) {
        try {
            // 現在のDB IDを使って設定をロード
            await loadDbConfig(CURRENT_DB_CONFIG.id); 
            
            if (!DATA_SOURCE_ID) {
                throw new Error("Notion設定エラー: データソースIDの取得に失敗しました。設定を確認してください。");
            }
            
            displayCurrentDbTitle(CURRENT_DB_CONFIG.name);

            await checkRunningState(); 
            // ★ 初期ロード時にフィルタなしでタスクとKPIをロード
            await loadTasksAndKpi(); 

        } catch (error) {
            console.error('初期化エラー:', error);
            alert(`初期化に失敗しました。エラー: ${error.message || '不明なエラー'}`);
            openSettingsModal();
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
        
        // 複数DBの設定をロード
        ALL_DB_CONFIGS = savedSettings.allDbConfigs || [];
        
        // 最後に選択されていたDB IDを取得 (未選択の場合は最初のDB ID)
        const currentDbId = savedSettings.currentDbId || (ALL_DB_CONFIGS[0] ? ALL_DB_CONFIGS[0].id : '');
        
        // 現在のDB設定を特定
        CURRENT_DB_CONFIG = ALL_DB_CONFIGS.find(db => db.id === currentDbId) || ALL_DB_CONFIGS[0] || null;
    }
}

// DB IDを引数として受け取るように変更
async function loadDbConfig(dbId) {
    console.log('DB設定をロード中...');
    try {
        const configData = await apiCustomFetch('getConfig', {
            dbId: dbId, 
            tokenValue: NOTION_TOKEN
        });

        if (configData && configData.dataSourceId) {
            DATA_SOURCE_ID = configData.dataSourceId;
        } else {
            throw new Error("Notion DBからデータソースIDを取得できませんでした。データベース設定または統合の権限を確認してください。");
        }

        CATEGORIES = configData.categories || [];
        DEPARTMENTS = configData.departments || [];
        
        console.log('DB設定ロード完了:', { categories: CATEGORIES, departments: DEPARTMENTS, dataSourceId: DATA_SOURCE_ID });
        renderFormOptions(); 
        renderDbSelectOptions(); 

    } catch (e) {
        console.error('DB設定ロードエラー:', e);
        throw new Error(`DB設定ロードエラー: ${e.message || 'TypeError: Failed to fetch'}`);
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

    // カテゴリ (Select)
    categoryContainer.innerHTML = '<select id="taskCategory"></select>';
    
    const taskCategorySelect = document.getElementById('taskCategory');
    taskCategorySelect.innerHTML = '<option value="">-- 選択 --</option>';
    CATEGORIES.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        taskCategorySelect.appendChild(option);
    });

    // 部門 (Multi-Select)
    departmentDiv.innerHTML = '';
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

// ★★★ 修正: loadTasksAndKpi がフィルタパラメータを受け取るように変更 ★★★
async function loadTasksAndKpi(filterProjectName = '') {
    await loadTaskList(filterProjectName);
    await loadKpi();
}

// ★★★ 修正: loadTaskList にフィルタリングロジックとプロジェクト収集を追加 ★★★
async function loadTaskList(filterProjectName = '') { 
    console.log(`タスク一覧をロード中 (フィルタ: ${filterProjectName || 'なし'})...`);
    
    if (!DATA_SOURCE_ID) {
        $taskList.innerHTML = '<li><p>設定が必要です。設定画面からNotionトークンとDB IDを入力してください。</p></li>';
        return;
    }

    const targetUrl = `https://api.notion.com/v1/data_sources/${DATA_SOURCE_ID}/query`; 

    // ステータスフィルター（「完了」を除く）
    const statusFilter = {
        property: 'ステータス',
        status: {
            does_not_equal: '完了'
        }
    };
    
    // プロジェクトフィルター（引数で渡された場合のみ追加）
    const projectFilter = filterProjectName ? {
        property: 'プロジェクト', // NotionDBのプロパティ名に合わせてください
        relation: {
            contains: filterProjectName 
        }
    } : null;

    // 複数のフィルターをAND条件で結合
    const combinedFilter = {
        and: [statusFilter]
    };
    if (projectFilter) {
        combinedFilter.and.push(projectFilter);
    }
    
    try {
        // Notion APIへのクエリ
        const response = await apiFetch(targetUrl, 'POST', { filter: combinedFilter }, 'notionToken', NOTION_TOKEN);
        const tasks = response.results;
        
        // ★★★ プロジェクト一覧の収集 ★★★
        const uniqueProjects = new Set();
        tasks.forEach(task => {
            // プロジェクトプロパティ（リレーション）の取得
            const projectRelations = task.properties['プロジェクト']?.relation || []; // NotionDBのプロパティ名に合わせてください
            projectRelations.forEach(rel => {
                uniqueProjects.add(rel.id); 
            });
        });
        
        ALL_PROJECTS = Array.from(uniqueProjects);
        renderProjectFilterOptions(ALL_PROJECTS, filterProjectName); // ★ フィルタUIを更新

        $taskList.innerHTML = '';
        if (tasks.length === 0) {
             $taskList.innerHTML = filterProjectName 
                ? `<li>プロジェクトID: ${filterProjectName.substring(0, 8)}... に該当するタスクはありません。</li>`
                : '<li>現在のタスクはありません。</li>';
            return;
        }

        // タスク一覧のレンダリング
        tasks.forEach(task => {
            const title = task.properties['タスク名']?.title?.[0]?.plain_text || '名前なしタスク';
            const category = task.properties['カテゴリ']?.select?.name || '未設定';
            const department = task.properties['部門']?.multi_select?.map(d => d.name).join(', ') || '未設定';
            const status = task.properties['ステータス']?.status?.name || '未設定';
            const pageId = task.id;
            const notionUrl = task.url;

            const listItem = document.createElement('li');
            listItem.className = 'task-item';
            listItem.innerHTML = `
                <div class="task-info">
                    <span class="task-title">${title}</span>
                    <span class="task-meta">
                        [${category}] / [${department}] - ステータス: ${status}
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
    }
}

// ★★★ 新規追加関数: プロジェクトフィルタドロップダウンのレンダリング ★★★
function renderProjectFilterOptions(projects, currentFilterId) {
    const $filterSelect = document.getElementById('projectFilter');
    if (!$filterSelect) return;

    // 現在の選択状態を保持
    const selectedValue = currentFilterId || '';

    $filterSelect.innerHTML = '';
    
    // 1. 「全てのタスク」オプションを追加
    let optionAll = document.createElement('option');
    optionAll.value = '';
    optionAll.textContent = '全てのタスク';
    $filterSelect.appendChild(optionAll);

    // 2. 収集したプロジェクトオプションを追加 (ID表示)
    projects.forEach(projectId => {
        const option = document.createElement('option');
        option.value = projectId;
        option.textContent = `プロジェクトID: ${projectId.substring(0, 8)}...`;
        $filterSelect.appendChild(option);
    });

    // 3. 選択状態を復元
    $filterSelect.value = selectedValue;
}
// ★★★ ここまで新規追加 ★★★

async function loadKpi() {
    console.log('KPIをロード中...');
    
    if (!DATA_SOURCE_ID) {
        document.getElementById('kpiWeek').textContent = '--';
        document.getElementById('kpiMonth').textContent = '--';
        document.getElementById('kpiCategoryContainer').innerHTML = 'データソースID未設定';
        return; 
    }
    
    try {
        const kpiData = await apiCustomFetch('getKpi', {
            dataSourceId: DATA_SOURCE_ID, 
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

function renderDbSelectOptions() {
    const $dbSelect = document.getElementById('new-db-select');
    if (!$dbSelect) return;

    $dbSelect.innerHTML = '';
    
    if (ALL_DB_CONFIGS.length === 0) {
        $dbSelect.innerHTML = '<option value="">--- DB設定がありません ---</option>';
        return;
    }

    ALL_DB_CONFIGS.forEach(db => {
        const option = document.createElement('option');
        option.value = db.id;
        option.textContent = `${db.name} (${db.id.substring(0, 8)}...)`;
        $dbSelect.appendChild(option);
    });

    // 現在選択中のDB IDを選択状態にする
    if (CURRENT_DB_CONFIG) {
        $dbSelect.value = CURRENT_DB_CONFIG.id;
    }
}


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
    
    if (!DATA_SOURCE_ID) {
        alert('エラー: データベース設定が不完全です。設定モーダルでDB IDを保存してください。');
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
        type: 'database_id', // database_id を使用
        database_id: CURRENT_DB_CONFIG.id 
    };

    const targetUrl = 'https://api.notion.com/v1/pages';
    
    try {
        showLoading();
        await apiFetch(targetUrl, 'POST', { parent: parentObject, properties: pageProperties }, 'notionToken', NOTION_TOKEN);
        alert('タスクが正常に作成されました！');
        document.getElementById('newTaskTitle').value = ''; 
        if (document.getElementById('taskCategory')) document.getElementById('taskCategory').value = ''; 
        document.querySelectorAll('#newDeptContainer input[name="taskDepartment"]:checked').forEach(cb => cb.checked = false);
        // タスク作成後はフィルタなしで一覧を再ロード
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
            // 完了後はフィルタなしで一覧を再ロード
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
    // リロードボタンが押されたら、現在のフィルタ状態で再ロード
    $reloadTasksBtn.addEventListener('click', () => {
        const currentFilterId = document.getElementById('projectFilter')?.value || '';
        loadTasksAndKpi(currentFilterId);
    });
} 

// ★★★ 新規追加: プロジェクトフィルタ変更リスナー ★★★
const $projectFilterSelect = document.getElementById('projectFilter');
if ($projectFilterSelect) {
    $projectFilterSelect.addEventListener('change', function() {
        const selectedId = this.value;
        // 選択されたIDでタスク一覧を再ロード
        loadTasksAndKpi(selectedId);
    });
}
// ★★★ ここまで新規追加 ★★★

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

// DB切り替え時の処理 (new-db-select)
const $dbSelect = document.getElementById('new-db-select');
if ($dbSelect) {
    $dbSelect.addEventListener('change', function() {
        const newDbId = this.value;
        // 現在のDB IDと異なる場合にのみ処理を実行
        if (newDbId && (CURRENT_DB_CONFIG ? newDbId !== CURRENT_DB_CONFIG.id : true)) {
            
            // 選択したDB IDをlocalStorageのcurrentDbIdとして保存
            const currentSettings = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
            currentSettings.currentDbId = newDbId;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSettings));
            
            alert(`DBを切り替えます: ${this.options[this.selectedIndex].text}`);
            
            // アプリを再ロードし、新しいDB設定で初期化
            location.reload(); 
        }
    });
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

    // 現在選択中のDB IDを取得 (選択されていない場合は最初のDB IDをセット)
    const currentDbId = document.getElementById('new-db-select')?.value || (newAllDbConfigs[0] ? newAllDbConfigs[0].id : '');

    const settings = { 
        notionToken, 
        togglApiToken,
        togglWid,
        allDbConfigs: newAllDbConfigs,
        currentDbId: currentDbId
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
