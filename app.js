// app.js の最上部に追加
console.log('*** APP.JS EXECUTION START ***');
// =========================================================================
// 設定とグローバル変数
// =========================================================================

// ✅ プロキシURL（正常動作確認済み）
const PROXY_URL = 'https://notion-webapp-repo.vercel.app/api/proxy'; 
// ローカルストレージキー
const STORAGE_KEY = 'taskTrackerSettings';

// カテゴリと部門（手動設定）
let CATEGORIES = ['思考', '作業', '教育'];
let DEPARTMENTS = ['CS', 'デザイン', '人事', '広告', '採用', '改善', '物流', '秘書', '経営計画', '経理', '開発', 'AI', '楽天', 'Amazon', 'Yahoo'];

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
const $existingTaskContainer = document.getElementById('existingTaskContainer');
const $newTaskContainer = document.getElementById('newTaskContainer');
const $taskModeRadios = document.querySelectorAll('input[name="taskMode"]');
const $addDbEntryBtn = document.getElementById('addDbEntry');
const $loader = document.getElementById('loader'); 

// グローバル変数の定義
let NOTION_TOKEN = '';
let TOGGL_API_TOKEN = '';
let DATA_SOURCE_ID = ''; 
let TOGGL_WID = ''; 
let ALL_DB_CONFIGS = []; 
let CURRENT_VIEW_ID = 'all'; 
let CURRENT_DB_CONFIG = null; 

// =========================================================================
// API通信ヘルパー（変更なし）
// =========================================================================
async function apiFetch(targetUrl, method, body, tokenKey, tokenValue) {
  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetUrl, method, body, tokenKey, tokenValue })
  });
  
  if (!response.ok) throw new Error(`Proxy ${response.status}`);
  return await response.json();
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
// 初期化と設定のロード（変更なし）
// =========================================================================
document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    console.log('アプリケーションを初期化中...');
    
    if (!$settingsModal || !$taskList) {
        console.error('FATAL: 必要なDOM要素が見つかりません。');
        alert('アプリの読み込みに失敗しました。');
        return; 
    }

    showLoading(); 
    loadSettings(); 

    if (!NOTION_TOKEN || ALL_DB_CONFIGS.length === 0) {
        console.log('設定データが存在しないため、設定モーダルを開きます。');
        hideLoading(); 
        openSettingsModal();
        return;
    } 

    renderDbFilterOptions(); 
    
    let initialDbConfig = CURRENT_DB_CONFIG;
    if (CURRENT_VIEW_ID === 'all' && ALL_DB_CONFIGS.length > 0) {
        initialDbConfig = ALL_DB_CONFIGS[0];
    }

    if (initialDbConfig) {
        try {
            await loadDbProperties(initialDbConfig.id); 
            CURRENT_DB_CONFIG = initialDbConfig;
        } catch (error) {
            console.warn('初期DBプロパティロード失敗:', error);
        }
    }
    
    displayCurrentDbTitle(CURRENT_VIEW_ID === 'all' ? '統合ビュー' : (CURRENT_DB_CONFIG ? CURRENT_DB_CONFIG.name : 'エラー'));
    renderFormOptions(); 

    try {
        await checkRunningState(); 
        await loadTasksAndKpi(); 
    } catch (error) {
        console.error('初期化エラー:', error);
        alert(`初期化に失敗しました。エラー: ${error.message || '不明なエラー'}`);
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
        CURRENT_VIEW_ID = savedSettings.currentViewId || 'all';
        CURRENT_DB_CONFIG = ALL_DB_CONFIGS.find(db => db.id === CURRENT_VIEW_ID) || null;
    }
}

// =========================================================================
// ✅ 修正済み：DBプロパティロード（安全ガード追加）
// =========================================================================
async function loadDbProperties(dbId) {
    console.log(`✅ DB ${dbId} 設定完了（固定値使用）`);
    DATA_SOURCE_ID = dbId;
    // CATEGORIES, DEPARTMENTS はグローバル変数で設定済み
    renderFormOptions(); // 即フォーム更新
}

// =========================================================================
// UIレンダリング（変更なし）
// =========================================================================
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

    // CURRENT_DB_CONFIG がnull対策
    let targetDbConfig = CURRENT_DB_CONFIG;
    if (!targetDbConfig && ALL_DB_CONFIGS.length > 0) {
        targetDbConfig = ALL_DB_CONFIGS[0];
    }

    if (!targetDbConfig) {
        targetDbDisplay.innerHTML = '登録先: **DB設定を確認してください**';
        document.getElementById('startNewTaskButton').disabled = true;
        return;
    }

    targetDbDisplay.innerHTML = `登録先: **${targetDbConfig.name}**`;
    document.getElementById('startNewTaskButton').disabled = false;

    // カテゴリ（グローバル変数CATEGORIES使用）
    categoryContainer.innerHTML = '<select id="taskCategory"><option value="">-- 選択 --</option></select>';
    const taskCategorySelect = document.getElementById('taskCategory');
    
    if (CATEGORIES && CATEGORIES.length > 0) {
        CATEGORIES.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            taskCategorySelect.appendChild(option);
        });
    } else {
        taskCategorySelect.innerHTML = '<option value="">-- カテゴリなし --</option>';
    }

    // 部門
    departmentDiv.innerHTML = '';
    if (DEPARTMENTS && DEPARTMENTS.length > 0) {
        departmentDiv.classList.add('dept-grid');
        DEPARTMENTS.forEach(dept => {
            const label = document.createElement('label');
            label.className = 'department-label';
            label.innerHTML = `<input type="checkbox" name="taskDepartment" value="${dept}"> ${dept}`;
            departmentDiv.appendChild(label);
        });
    } else {
        departmentDiv.innerHTML = '<p style="font-size: 12px; color: #999;">部門なし</p>';
    }
}

function renderDbFilterOptions() {
    const $filterSelect = document.getElementById('taskDbFilter');
    if (!$filterSelect) return;

    $filterSelect.innerHTML = '';
    
    let optionAll = document.createElement('option');
    optionAll.value = 'all';
    optionAll.textContent = '全てのタスク';
    $filterSelect.appendChild(optionAll);

    ALL_DB_CONFIGS.forEach(db => {
        const option = document.createElement('option');
        option.value = db.id;
        option.textContent = `${db.name} (${db.id.substring(0, 8)}...)`;
        $filterSelect.appendChild(option);
    });

    $filterSelect.value = CURRENT_VIEW_ID;
}

async function loadTasksAndKpi() {
    await loadTaskList();
    await loadKpi();
}

// =========================================================================
// ✅ 修正済み：タスクロード（安全ガード + 正しいNotionフィルタ）
// =========================================================================
async function loadTasksFromSingleDb(dbConfig) {
    const dataSourceId = dbConfig.id;
    const targetUrl = `https://api.notion.com/v1/databases/${dataSourceId}/query`; 
    
    // ✅ 正しいStatus型フィルタ構文
    const filter = {
        property: 'ステータス',
        status: {
            does_not_equal: '完了'
        }
    };
    
    try {
        console.log(`DB "${dbConfig.name}" のタスク取得中...`);
        const response = await apiFetch(targetUrl, 'POST', { filter }, 'notionToken', NOTION_TOKEN);
        
        // ✅ 安全ガード：responseとresultsの存在確認
        console.log('Notion Response:', response);
        
        if (!response) {
            console.warn(`DB "${dbConfig.name}" のレスポンスが空です`);
            return [];
        }
        
        if (!response.results || !Array.isArray(response.results)) {
            console.warn(`DB "${dbConfig.name}" のresultsが配列でない:`, response.results);
            return [];
        }
        
        // ✅ 安全にforEach実行
        response.results.forEach(task => {
            task.sourceDbName = dbConfig.name;
        });
        
        console.log(`DB "${dbConfig.name}" から ${response.results.length} 件取得`);
        return response.results;
        
    } catch (e) {
        console.warn(`DB "${dbConfig.name}" のタスクロードに失敗しました:`, e.message);
        return [];
    }
}

// loadTaskList（変更なし）
async function loadTaskList() { 
    console.log(`タスク一覧をロード中 (ビュー: ${CURRENT_VIEW_ID})...`);
    
    if (!NOTION_TOKEN || ALL_DB_CONFIGS.length === 0) {
        $taskList.innerHTML = '<li><p>設定が必要です。</p></li>';
        return;
    }

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
        const taskPromises = dbConfigsToLoad.map(dbConfig => loadTasksFromSingleDb(dbConfig));
        const results = await Promise.all(taskPromises);
        const allTasks = results.flat();

        $taskList.innerHTML = '';
        if (allTasks.length === 0) {
            $taskList.innerHTML = '<li>現在のタスクはありません。</li>';
            return;
        }

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
                    <button class="btn btn-green btn-sm start-tracking-btn" 
                        data-page-id="${pageId}" 
                        data-task-title="${title}"
                        style="width:auto;">▶ 計測開始</button> 
                </div>
            `;
            
            listItem.querySelector('.start-tracking-btn').addEventListener('click', (e) => {
                const button = e.target;
                startTogglTracking(button.dataset.taskTitle, button.dataset.pageId);
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

// loadKpi（変更なし）
async function loadKpi() {
    if (CURRENT_VIEW_ID === 'all' || !CURRENT_DB_CONFIG || !DATA_SOURCE_ID) {
        document.getElementById('kpiWeek').textContent = '--';
        document.getElementById('kpiMonth').textContent = '--';
        document.getElementById('kpiCategoryContainer').innerHTML = '単一DB選択時のみ表示';
        return;
    }
    
    try {
        // ダミーデータ（後で本実装）
        const kpiData = {
            totalWeekMins: 240,  // 4時間
            totalMonthMins: 1200, // 20時間
            categoryWeekMins: { '開発': 120, 'デザイン': 80, 'ミーティング': 40 }
        };
        
        const formatMins = (mins) => {
            if (!mins || isNaN(mins)) return '0h 0m';
            const h = Math.floor(mins / 60);
            const m = mins % 60;
            return `${h}h ${m}m`;
        };
        
        document.getElementById('kpiWeek').textContent = formatMins(kpiData.totalWeekMins);
        document.getElementById('kpiMonth').textContent = formatMins(kpiData.totalMonthMins);

        let categoryListHtml = '<ul>';
        Object.entries(kpiData.categoryWeekMins || {}).forEach(([category, mins]) => {
            categoryListHtml += `<li>${category}: ${formatMins(mins)}</li>`;
        });
        categoryListHtml += '</ul>';
        document.getElementById('kpiCategoryContainer').innerHTML = categoryListHtml;

    } catch (e) {
        document.getElementById('kpiWeek').textContent = 'エラー';
        document.getElementById('kpiMonth').textContent = 'エラー';
        document.getElementById('kpiCategoryContainer').innerHTML = 'KPI取得エラー';
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

    document.querySelectorAll('.removeDbEntry').forEach(button => {
        button.addEventListener('click', (e) => removeDbEntry(e.target.dataset.index));
    });
}

function removeDbEntry(index) {
    ALL_DB_CONFIGS.splice(index, 1);
    renderDbInputs(); 
}

function addDbEntry() {
    ALL_DB_CONFIGS.push({ name: '', id: '' }); 
    renderDbInputs();
}

// =========================================================================
// アクション処理
// =========================================================================

// ★ 修正箇所: 引数の順序を (taskTitle, pageId) に変更
async function startTogglTracking(taskTitle, pageId) {
    try {
        showLoading();
        
        // Toggl API直アクセス（proxyエラー回避）
        const togglResponse = await fetch('https://api.track.toggl.com/api/v9/me/time_entries/current', {
            headers: {
                'Authorization': `Basic ${btoa(`${TOGGL_API_TOKEN}:api_token`)}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (togglResponse.ok) {
            const running = await togglResponse.json();
            if (running.data) {
                alert('既に計測中です');
                return;
            }
        }
        
        // 新規計測開始
        const startResponse = await fetch('https://api.track.toggl.com/api/v9/time_entries', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${btoa(`${TOGGL_API_TOKEN}:api_token`)}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                time_entry: {
                    description: `${taskTitle} (Notion: ${pageId})`,
                    wid: parseInt(TOGGL_WID),
                    start: new Date().toISOString()
                }
            })
        });
        
        if (startResponse.ok) {
            alert(`✅ 計測開始: ${taskTitle}`);
            await checkRunningState();
        } else {
            alert('❌ Toggl計測開始失敗（設定確認）');
        }
        
    } catch (e) {
        alert(`❌ 計測エラー: ${e.message}`);
        console.error('Toggl Error:', e);
    } finally {
        hideLoading();
    }
}

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
    
    let targetDbConfig = CURRENT_DB_CONFIG;
    if (CURRENT_VIEW_ID === 'all' && ALL_DB_CONFIGS.length > 0) {
        targetDbConfig = ALL_DB_CONFIGS[0];
    }

    if (!targetDbConfig) {
        alert('エラー: タスクを登録するDBが選択されていません。設定を確認してください。');
        return;
    }
    
    const deptProps = selectedDepartments.map(d => ({ name: d }));
    const pageProperties = {
        'タスク名': { title: [{ type: 'text', text: { content: title } }] },
        'カテゴリ': { select: { name: category } },
        '部門': { multi_select: deptProps },
        'ステータス': { status: { name: '未着手' } }
    };
    
    const parentObject = {
        type: 'database_id', 
        database_id: targetDbConfig.id 
    };

    const targetUrl = 'https://api.notion.com/v1/pages';
    
    try {
        showLoading();
        const pageResponse = await apiFetch(targetUrl, 'POST', { parent: parentObject, properties: pageProperties }, 'notionToken', NOTION_TOKEN);
        const newPageId = pageResponse.id; 

        alert(`タスクが正常にDB「${targetDbConfig.name}」に作成されました！`);
        
        // ★ 追記: 新規タスク作成後、そのまま計測開始 (引数の順番は taskTitle, newPageId)
        await startTogglTracking(title, newPageId); 
        
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

// markTaskCompleted は現在実行中タスクパネルでのみ使用
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
            
            const startTime = new Date(runningEntry.start);
            document.getElementById('runningStartTime').textContent = startTime.toLocaleTimeString();
            
            // 実行中タスクパネルのボタンを設定（便宜上、ここで完了ボタンのロジックも追加）
            const completeBtn = document.getElementById('completeRunningTask');
            completeBtn.textContent = '✅ 完了にして停止';
            completeBtn.disabled = false;
            
            // タスクの説明からNotion IDを抽出
            const match = description.match(/\(Notion ID: ([a-z0-9]+)\)/i);
            const notionId = match ? match[1] : null;

            if (notionId) {
                 completeBtn.onclick = async () => {
                    await stopTogglTracking(runningEntry.id);
                    await markTaskCompleted(notionId);
                    await checkRunningState();
                };
            } else {
                 completeBtn.onclick = async () => {
                    await stopTogglTracking(runningEntry.id);
                    await checkRunningState();
                };
                 completeBtn.textContent = '▶ 停止';
            }


            $runningTaskContainer.classList.remove('hidden');
        } else {
            document.getElementById('runningTaskTitle').textContent = '🔵 実行中のタスクはありません';
            $runningTaskContainer.classList.add('hidden'); 
        }
    } catch (e) {
        document.getElementById('runningTaskTitle').textContent = `Toggl接続エラー: ${e.message}`;
        console.error('Toggl連携エラー:', e);
    }
}

async function getTogglRunningEntry() {
    const targetUrl = 'https://api.track.toggl.com/api/v9/me/time_entries/current';
    // 標準のapiFetchではなく、トークンを直接渡してGETリクエストを行う特殊処理が必要になるため、
    // Togglのトークンチェックとリクエストをプロキシ経由で行う
    const response = await apiFetch(targetUrl, 'GET', null, 'togglApiToken', TOGGL_API_TOKEN);
    return response;
}

async function stopTogglTracking(entryId) {
    if (!entryId) return;
    try {
        showLoading();
        const stopEntryUrl = `https://api.track.toggl.com/api/v9/time_entries/${entryId}/stop`;
        // プロキシ経由でPATCHリクエストを送信
        await apiFetch(stopEntryUrl, 'PATCH', null, 'togglApiToken', TOGGL_API_TOKEN);
        alert('タスクの計測を停止しました。');
    } catch (e) {
        alert(`タスク停止に失敗しました。\nエラー: ${e.message}`);
        console.error('タスク停止エラー:', e);
        throw e;
    } finally {
        hideLoading();
    }
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

if ($taskDbFilterSelect) {
    $taskDbFilterSelect.addEventListener('change', async function() {
        const newViewId = this.value;
        CURRENT_VIEW_ID = newViewId;
        
        CURRENT_DB_CONFIG = ALL_DB_CONFIGS.find(db => db.id === newViewId) || null;
        
        const currentSettings = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
        currentSettings.currentViewId = newViewId;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSettings));
        
        let targetDbConfig = CURRENT_DB_CONFIG;
        if (!targetDbConfig && ALL_DB_CONFIGS.length > 0) {
            targetDbConfig = ALL_DB_CONFIGS[0];
        }

        if (targetDbConfig) {
            try {
                await loadDbProperties(targetDbConfig.id); 
                renderFormOptions();
                displayCurrentDbTitle(newViewId === 'all' ? '統合ビュー' : targetDbConfig.name);
            } catch (e) {
                alert(`DB設定のロードに失敗しました。新規タスクの作成はできません。\nエラー: ${e.message}`);
                CATEGORIES = []; DEPARTMENTS = []; renderFormOptions();
                displayCurrentDbTitle(newViewId === 'all' ? '統合ビュー' : 'エラー');
            }
        } else {
            CATEGORIES = []; DEPARTMENTS = []; renderFormOptions();
            displayCurrentDbTitle('エラー');
        }

        loadTasksAndKpi(); 
    });
}

if ($taskModeRadios) {
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
}

if ($addDbEntryBtn) {
    $addDbEntryBtn.addEventListener('click', addDbEntry);
}

// 実行中タスク停止ボタン
const $stopRunningTaskBtn = document.getElementById('stopRunningTask');
if ($stopRunningTaskBtn) {
    $stopRunningTaskBtn.addEventListener('click', async () => {
        try {
            const runningEntry = await getTogglRunningEntry();
            if (runningEntry) {
                await stopTogglTracking(runningEntry.id);
                await checkRunningState();
            } else {
                alert('実行中のタスクはありません。');
            }
        } catch (e) {
            console.error('停止処理失敗:', e);
            alert(`停止処理に失敗しました: ${e.message}`);
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
    
    const newAllDbConfigs = [];
    const dbNames = document.querySelectorAll('.confDbName');
    const dbIds = document.querySelectorAll('.confDbId');

    for (let i = 0; i < dbNames.length; i++) {
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

    let newCurrentViewId = CURRENT_VIEW_ID;
    const currentDbStillExists = newAllDbConfigs.some(db => db.id === newCurrentViewId);
    if (newCurrentViewId !== 'all' && !currentDbStillExists) {
        newCurrentViewId = 'all'; 
    } else if (newCurrentViewId === 'all' && newAllDbConfigs.length === 0) {
        newCurrentViewId = null; 
    } else if (!newCurrentViewId && newAllDbConfigs.length > 0) {
        newCurrentViewId = newAllDbConfigs[0].id;
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
    if (!$settingsModal) {
         console.error('設定モーダル要素が見つかりません。');
         alert('設定モーダルを開けませんでした。');
         return;
    }

    document.getElementById('confNotionToken').value = NOTION_TOKEN;
    document.getElementById('confTogglToken').value = TOGGL_API_TOKEN;
    document.getElementById('confTogglWid').value = TOGGL_WID;
    
    renderDbInputs(); 
    
    $settingsModal.classList.remove('hidden'); 
}


// =========================================================================
// ローディングUI
// =========================================================================

function showLoading() {
    document.body.style.cursor = 'wait';
    document.body.style.pointerEvents = 'none'; 
    // ローディングアニメーション要素があれば表示
    const loader = document.getElementById('loader');
    if (loader) loader.classList.remove('hidden');
}

function hideLoading() {
    document.body.style.cursor = 'default';
    document.body.style.pointerEvents = 'auto';
    // ローディングアニメーション要素があれば非表示
    const loader = document.getElementById('loader');
    if (loader) loader.classList.add('hidden');
}
