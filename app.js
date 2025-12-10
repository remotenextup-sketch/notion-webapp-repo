// =========================================================================
// 設定とグローバル変数
// =========================================================================

// プロキシサーバーのURL (Vercelデプロイ後のURLに置き換えてください)
const PROXY_URL = 'https://notion-proxy-repo.vercel.app/api/proxy'; 

// ローカルストレージキー
const STORAGE_KEY = 'taskTrackerSettings';

// ★★★ 修正点: index.htmlのIDに合わせて変更 ★★★
const $settingsModal = document.getElementById('settingsView'); 
const $taskForm = document.getElementById('newTaskContainer'); // 新規タスクコンテナを使用
const $taskList = document.getElementById('taskList');
const $kpiMetrics = document.getElementById('kpiPanel'); // KPI表示パネル全体
const $runningTask = document.getElementById('runningTaskContainer');
const $settingsBtn = document.getElementById('toggleSettings'); // ⚙️ボタン
const $saveSettingsBtn = document.getElementById('saveConfig'); // 保存ボタン
// ★ 追記: index.htmlに存在しないため、ダミーを作成するか、ローディングロジックを修正する必要がある
// 今回は、エラーが出ていたため、HTMLに存在しない要素への参照を削除し、代わりに body にスタイルを適用するロジックに変更
let IS_LOADING = false;


// 設定値（ローカルストレージからロードされるか、ユーザーが入力）
let NOTION_TOKEN = '';
let DB_ID = '';
let TOGGL_API_TOKEN = '';
let CATEGORIES = [];
let DEPARTMENTS = [];
let DATA_SOURCE_ID = ''; 

// =========================================================================
// 初期化と設定のロード
// =========================================================================

document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    console.log('アプリケーションを初期化中...');
    showLoading();
    loadSettings();

    if (NOTION_TOKEN && DB_ID) {
        try {
            await loadDbConfig(); 
            
            if (!DATA_SOURCE_ID) {
                throw new Error("Notion設定エラー: データソースIDの取得に失敗しました。設定を確認してください。");
            }
            
            await checkRunningState(); 
            await loadTasksAndKpi(); 
            // $settingsBtn.style.display = 'block'; // HTML側で既に表示されているため不要
        } catch (error) {
            console.error('初期化エラー:', error);
            if (error.message && error.message.includes('DB設定ロードエラー')) {
                alert(`DB設定ロードエラーにより初期化に失敗しました。統合権限、DB ID、またはトークンを確認してください。\nエラー: ${error.message}`);
            } else {
                alert(`初期化に失敗しました。エラー: ${error.message || '不明なエラー'}`);
            }
            openSettingsModal();
        }
    } else {
        openSettingsModal();
    }
    hideLoading();
}

// ... (loadSettings関数は省略)
function loadSettings() {
    const savedSettings = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (savedSettings) {
        NOTION_TOKEN = savedSettings.notionToken || '';
        DB_ID = savedSettings.dbId || '';
        TOGGL_API_TOKEN = savedSettings.togglApiToken || '';
    }
}


/**
 * DB設定（カテゴリ、部門、データソースID）をロードし、Notion API v2025-09-03に対応する
 */
async function loadDbConfig() {
    console.log('DB設定をロード中...');
    try {
        const configData = await apiCustomFetch('getConfig', {
            dbId: DB_ID, 
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

    } catch (e) {
        console.error('DB設定ロードエラー:', e);
        throw new Error(`DB設定ロードエラー: ${e.message || 'TypeError: Failed to fetch'}`);
    }
}


// =========================================================================
// UIレンダリング
// =========================================================================

/**
 * 新規タスク作成フォームにカテゴリと部門のオプションをレンダリング
 */
function renderFormOptions() {
    // index.htmlのIDに合わせて修正
    const categorySelect = document.getElementById('newCatContainer'); 
    const departmentDiv = document.getElementById('newDeptContainer');

    // カテゴリ (Select) - HTMLにSelectタグがないため、仮でSelectタグを作成
    categorySelect.innerHTML = '<h4>カテゴリ</h4><select id="taskCategory"></select>';
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

/**
 * タスク一覧とKPIを同時にロードしてレンダリング
 */
async function loadTasksAndKpi() {
    await loadTaskList();
    await loadKpi();
}

async function loadTaskList() {
    // ... (タスク一覧ロードロジックはDATA_SOURCE_IDを使用するため変更なし)
    console.log('タスク一覧をロード中...');
    
    const targetUrl = `https://api.notion.com/v1/data_sources/${DATA_SOURCE_ID}/query`; 

    const filter = {
        property: 'ステータス',
        status: {
            does_not_equal: '完了'
        }
    };
    
    try {
        const response = await apiFetch(targetUrl, 'POST', { filter: filter }, 'notionToken', NOTION_TOKEN);
        const tasks = response.results;
        
        $taskList.innerHTML = '';
        if (tasks.length === 0) {
            $taskList.innerHTML = '<li>現在のタスクはありません。</li>';
            return;
        }

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
                    <a href="${notionUrl}" target="_blank" class="btn btn-secondary btn-sm">Notionで開く</a>
                    <button class="btn btn-green btn-sm" data-page-id="${pageId}">完了</button>
                </div>
            `;
            listItem.querySelector('.btn-green').addEventListener('click', () => markTaskCompleted(pageId));
            $taskList.appendChild(listItem);
        });

    } catch (e) {
        $taskList.innerHTML = `<li><p class="error-message">タスク一覧のロードに失敗しました。エラー: ${e.message}</p></li>`;
        console.error('タスク一覧ロードエラー:', e);
    }
}

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
        
        // HTMLの特定のIDに値をセット
        document.getElementById('kpiWeek').textContent = formatMins(kpiData.totalWeekMins);
        document.getElementById('kpiMonth').textContent = formatMins(kpiData.totalMonthMins);

        let categoryListHtml = '<h4>今週のカテゴリ別時間</h4><ul>';
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
// アクション処理
// =========================================================================

/**
 * 新規タスクをNotionに作成する
 */
async function createNotionTask(e) {
    e.preventDefault();
    
    // HTMLのIDに合わせて変更
    const title = document.getElementById('newTaskTitle').value;
    const category = document.getElementById('taskCategory').value;
    const selectedDepartments = Array.from(document.querySelectorAll('input[name="taskDepartment"]:checked'))
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
        type: 'data_source_id',
        data_source_id: DATA_SOURCE_ID
    };

    const targetUrl = 'https://api.notion.com/v1/pages';
    
    try {
        showLoading();
        await apiFetch(targetUrl, 'POST', { parent: parentObject, properties: pageProperties }, 'notionToken', NOTION_TOKEN);
        alert('タスクが正常に作成されました！');
        document.getElementById('newTaskTitle').value = ''; // リセット
        document.getElementById('taskCategory').value = ''; 
        document.querySelectorAll('input[name="taskDepartment"]:checked').forEach(cb => cb.checked = false);
        await loadTasksAndKpi();
    } catch (e) {
        alert(`タスク作成に失敗しました。\nエラー: ${e.message}`);
        console.error('タスク作成エラー:', e);
    } finally {
        hideLoading();
    }
}

/**
 * タスクを完了済みにマークする
 */
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
// Toggl 連携 (省略)
// =========================================================================
// ... (checkRunningState, getTogglRunningEntry, stopTogglEntry は変更なし)

async function checkRunningState() {
    if (!TOGGL_API_TOKEN) {
        document.getElementById('runningTaskTitle').textContent = 'Toggl連携なし';
        return;
    }
    
    try {
        const runningEntry = await getTogglRunningEntry();
        
        if (runningEntry) {
            const description = runningEntry.description || 'タイトルなし';
            document.getElementById('runningTaskTitle').textContent = description;
            $runningTask.classList.remove('hidden');
            // ... (タイマー表示ロジックは省略)
        } else {
            document.getElementById('runningTaskTitle').textContent = '🔵 実行中のタスクはありません';
            $runningTask.classList.add('hidden');
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

async function stopTogglEntry(entryId) {
    // Toggl API v9 エンドポイント (停止はPATCHを使用)
    const targetUrl = `https://api.track.toggl.com/api/v9/time_entries/${entryId}/stop`;
    
    try {
        showLoading();
        await apiFetch(targetUrl, 'PATCH', {}, 'togglApiToken', TOGGL_API_TOKEN);
        alert('Togglタスクを停止しました。');
        await checkRunningState();
    } catch (e) {
        alert(`Togglタスクの停止に失敗しました。\nエラー: ${e.message}`);
        console.error('Toggl停止エラー:', e);
    } finally {
        hideLoading();
    }
}

// ... (apiFetch, apiCustomFetch は変更なし)
async function apiFetch(targetUrl, method, body, tokenKey, tokenValue) {
    const response = await fetch(PROXY_URL, {
        method: 'POST', // プロキシ自体へのリクエストは常にPOST
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl, method, body, tokenKey, tokenValue })
    });
    // ... (エラー処理省略)
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
    // ... (エラー処理省略)
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
// UIイベントリスナー
// =========================================================================

// ★ 修正点: タスク作成フォームのsubmitイベントをボタンのクリックイベントに置き換え
document.getElementById('startNewTaskButton').addEventListener('click', createNotionTask);

$settingsBtn.addEventListener('click', openSettingsModal);

$saveSettingsBtn.addEventListener('click', saveSettings);

/**
 * 設定をローカルストレージに保存する
 */
function saveSettings() {
    // ★ 修正点: HTMLのIDに合わせて変更
    const notionToken = document.getElementById('confNotionToken').value;
    const dbId = document.getElementById('confNotionDbId').value;
    const togglApiToken = document.getElementById('confTogglToken').value;

    if (!notionToken || !dbId) {
        alert('NotionトークンとDB IDは必須です。');
        return;
    }

    const settings = {
        notionToken: notionToken,
        dbId: dbId,
        togglApiToken: togglApiToken
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    
    // グローバル変数を更新
    NOTION_TOKEN = notionToken;
    DB_ID = dbId;
    TOGGL_API_TOKEN = togglApiToken;

    alert('設定を保存しました。アプリケーションをリロードします。');
    $settingsModal.style.display = 'none';
    location.reload(); 
}

/**
 * 設定モーダルを開く
 */
function openSettingsModal() {
    // ★ 修正点: HTMLのIDに合わせて変更
    document.getElementById('confNotionToken').value = NOTION_TOKEN;
    document.getElementById('confNotionDbId').value = DB_ID;
    document.getElementById('confTogglToken').value = TOGGL_API_TOKEN;
    $settingsModal.classList.remove('hidden'); // .hiddenクラスのトグル
}

/**
 * 設定モーダルを閉じる
 */
document.getElementById('cancelConfig').addEventListener('click', () => {
    $settingsModal.classList.add('hidden'); // .hiddenクラスのトグル
});

// ローディングUI表示・非表示
// ★ 修正点: loadingSpinnerが存在しないため、bodyにカーソルを適用するシンプルなロジックに変更
function showLoading() {
    IS_LOADING = true;
    document.body.style.cursor = 'wait';
}

function hideLoading() {
    IS_LOADING = false;
    document.body.style.cursor = 'default';
}
