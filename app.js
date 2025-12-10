// =========================================================================
// 設定とグローバル変数
// =========================================================================

// プロキシサーバーのURL (Vercelデプロイ後のURLに置き換えてください)
const PROXY_URL = 'https://notion-proxy-repo.vercel.app/api/proxy'; 

// ローカルストレージキー
const STORAGE_KEY = 'taskTrackerSettings';

// DOMエレメント (省略)
const $settingsModal = document.getElementById('settingsModal');
const $taskForm = document.getElementById('taskForm');
const $taskList = document.getElementById('taskList');
const $kpiMetrics = document.getElementById('kpiMetrics');
const $runningTask = document.getElementById('runningTask');
const $settingsBtn = document.getElementById('settingsBtn');
const $saveSettingsBtn = document.getElementById('saveSettingsBtn');
const $loadingSpinner = document.getElementById('loadingSpinner');

// 設定値（ローカルストレージからロードされるか、ユーザーが入力）
let NOTION_TOKEN = '';
let DB_ID = '';
let TOGGL_API_TOKEN = '';
let CATEGORIES = [];
let DEPARTMENTS = [];
let DATA_SOURCE_ID = ''; // ★ 追加: Notion API v2025-09-03対応

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
            await loadDbConfig(); // DB設定（カテゴリ、部門、データソースID）をロード
            
            // ★ 修正点: DATA_SOURCE_IDが取得できていない場合は、ここで処理を中断する
            if (!DATA_SOURCE_ID) {
                // loadDbConfig内でエラーがthrowされるため、通常はここには来ないが念のためチェック
                throw new Error("Notion設定エラー: データソースIDの取得に失敗しました。設定を確認してください。");
            }
            
            await checkRunningState(); // Togglの実行中タスクをチェック
            await loadTasksAndKpi(); // タスク一覧とKPIをロード
            $settingsBtn.style.display = 'block'; // 設定ボタンを表示
        } catch (error) {
            console.error('初期化エラー:', error);
            // エラーの種類に応じて表示を分ける
            if (error.message && error.message.includes('DB設定ロードエラー')) {
                alert(`DB設定ロードエラーにより初期化に失敗しました。設定または統合の権限を確認してください。\nエラー: ${error.message}`);
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

/**
 * ローカルストレージから設定をロードする
 */
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
    
    // api/proxy.js の getConfigAndDataSourceId 関数を呼び出す
    try {
        const configData = await apiCustomFetch('getConfig', {
            dbId: DB_ID, 
            tokenValue: NOTION_TOKEN
        });

        // ★ 修正点: サーバーから返された data_source_id を保存し、欠落時はエラーを投げる
        if (configData && configData.dataSourceId) {
            DATA_SOURCE_ID = configData.dataSourceId;
        } else {
            throw new Error("Notion DBからデータソースIDを取得できませんでした。データベース設定または統合の権限を確認してください。");
        }

        CATEGORIES = configData.categories || [];
        DEPARTMENTS = configData.departments || [];
        
        console.log('DB設定ロード完了:', { categories: CATEGORIES, departments: DEPARTMENTS, dataSourceId: DATA_SOURCE_ID });
        renderFormOptions(); // フォームのオプションをレンダリング

    } catch (e) {
        console.error('DB設定ロードエラー:', e);
        // エラーメッセージにプレフィックスを付けて、initializeAppで処理しやすくする
        throw new Error(`DB設定ロードエラー: ${e.message || 'TypeError: Failed to fetch'}`);
    }
}


// =========================================================================
// UIレンダリング (省略)
// =========================================================================

function renderFormOptions() {
    const categorySelect = document.getElementById('taskCategory');
    const departmentDiv = document.getElementById('departmentChecks');

    categorySelect.innerHTML = '<option value="">-- 選択 --</option>';
    CATEGORIES.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        categorySelect.appendChild(option);
    });

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

async function loadTasksAndKpi() {
    await loadTaskList();
    await loadKpi();
}

async function loadTaskList() {
    console.log('タスク一覧をロード中...');
    
    // Notion API v2025-09-03 対応: data_source_id を使用
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
            $taskList.innerHTML = '<p class="text-center">現在のタスクはありません。</p>';
            return;
        }

        // タスクのレンダリングロジック（省略）
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
                    <button class="btn btn-success btn-sm" data-page-id="${pageId}">完了</button>
                </div>
            `;
            listItem.querySelector('.btn-success').addEventListener('click', () => markTaskCompleted(pageId));
            $taskList.appendChild(listItem);
        });

    } catch (e) {
        $taskList.innerHTML = `<p class="error-message">タスク一覧のロードに失敗しました。エラー: ${e.message}</p>`;
        console.error('タスク一覧ロードエラー:', e);
    }
}

async function loadKpi() {
    console.log('KPIをロード中...');
    
    // ★ 修正点: DATA_SOURCE_IDがない場合は処理を中断
    if (!DATA_SOURCE_ID) {
        $kpiMetrics.innerHTML = '<p class="error-message">KPIロードスキップ: データソースIDが未設定です。</p>';
        return; 
    }
    
    try {
        const kpiData = await apiCustomFetch('getKpi', {
            dataSourceId: DATA_SOURCE_ID, 
            tokenValue: NOTION_TOKEN
        });
        
        // ... (KPI表示ロジックは省略)
        
    } catch (e) {
        $kpiMetrics.innerHTML = `<p class="error-message">KPIのロードに失敗しました。エラー: ${e.message}</p>`;
        console.error('KPIロードエラー:', e);
    }
}

// =========================================================================
// アクション処理 (省略)
// =========================================================================

async function createNotionTask(title, category, departments) {
    if (!DATA_SOURCE_ID) {
        alert('エラー: データベース設定が不完全です。設定モーダルでDB IDを保存してください。');
        return;
    }

    const deptProps = departments.map(d => ({ name: d }));
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
        $taskForm.reset();
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
// Toggl 連携 (省略)
// =========================================================================

async function checkRunningState() {
    if (!TOGGL_API_TOKEN) {
        $runningTask.textContent = 'Toggl連携なし';
        return;
    }
    
    try {
        const runningEntry = await getTogglRunningEntry();
        
        if (runningEntry) {
            const description = runningEntry.description || 'タイトルなし';
            $runningTask.innerHTML = `
                <span class="running-indicator">🔴 実行中:</span> ${description} 
                <button class="btn btn-warning btn-sm ml-2" data-toggl-id="${runningEntry.id}">停止</button>
            `;
            $runningTask.querySelector('.btn-warning').addEventListener('click', () => stopTogglEntry(runningEntry.id));
        } else {
            $runningTask.textContent = '🔵 実行中のタスクはありません';
        }

    } catch (e) {
        $runningTask.innerHTML = `<span class="error-message">Toggl接続エラー: ${e.message}</span>`;
        console.error('Toggl連携エラー:', e);
    }
}

async function getTogglRunningEntry() {
    const targetUrl = 'https://api.track.toggl.com/api/v9/me/time_entries/current';
    const response = await apiFetch(targetUrl, 'GET', null, 'togglApiToken', TOGGL_API_TOKEN);
    return response;
}

async function stopTogglEntry(entryId) {
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


// =========================================================================
// プロキシ通信ヘルパー (変更なし)
// =========================================================================

async function apiFetch(targetUrl, method, body, tokenKey, tokenValue) {
    const response = await fetch(PROXY_URL, {
        method: 'POST', // プロキシ自体へのリクエストは常にPOST
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            targetUrl,
            method, // ターゲットAPIで使用するメソッド
            body,
            tokenKey,
            tokenValue
        })
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
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            customEndpoint,
            ...params
        })
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
// UIイベントリスナー (省略)
// =========================================================================

$taskForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('taskTitle').value;
    const category = document.getElementById('taskCategory').value;
    const selectedDepartments = Array.from(document.querySelectorAll('input[name="taskDepartment"]:checked'))
                                     .map(checkbox => checkbox.value);
    
    if (!title || !category) {
        alert('タスク名とカテゴリは必須です。');
        return;
    }
    
    createNotionTask(title, category, selectedDepartments);
});

$settingsBtn.addEventListener('click', openSettingsModal);
$saveSettingsBtn.addEventListener('click', saveSettings);

function saveSettings() {
    const notionToken = document.getElementById('inputNotionToken').value;
    const dbId = document.getElementById('inputDbId').value;
    const togglApiToken = document.getElementById('inputTogglToken').value;

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
    
    NOTION_TOKEN = notionToken;
    DB_ID = dbId;
    TOGGL_API_TOKEN = togglApiToken;

    alert('設定を保存しました。アプリケーションをリロードします。');
    $settingsModal.style.display = 'none';
    location.reload(); 
}

function openSettingsModal() {
    document.getElementById('inputNotionToken').value = NOTION_TOKEN;
    document.getElementById('inputDbId').value = DB_ID;
    document.getElementById('inputTogglToken').value = TOGGL_API_TOKEN;
    $settingsModal.style.display = 'flex';
}

$settingsModal.querySelector('.close-btn').addEventListener('click', () => {
    $settingsModal.style.display = 'none';
});

function showLoading() {
    $loadingSpinner.style.display = 'block';
}

function hideLoading() {
    $loadingSpinner.style.display = 'none';
}
