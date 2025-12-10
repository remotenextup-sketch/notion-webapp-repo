// =========================================================================
// 設定とグローバル変数
// =========================================================================

// プロキシサーバーのURL (Vercelデプロイ後のURLに置き換えてください)
const PROXY_URL = 'https://notion-proxy-repo.vercel.app/api/proxy'; 

// ローカルストレージキー
const STORAGE_KEY = 'taskTrackerSettings';

// DOMエレメント
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
            await checkRunningState(); // Togglの実行中タスクをチェック
            await loadTasksAndKpi(); // タスク一覧とKPIをロード
            $settingsBtn.style.display = 'block'; // 設定ボタンを表示
        } catch (error) {
            console.error('初期化エラー:', error);
            alert(`初期化に失敗しました。設定を確認してください。\nエラー: ${error.message || '不明なエラー'}`);
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

        // ★ Notion API v2025-09-03 対応: サーバーから返された data_source_id を保存
        if (configData.dataSourceId) {
            DATA_SOURCE_ID = configData.dataSourceId;
        } else {
            throw new Error("Notion DBからデータソースIDを取得できませんでした。");
        }

        CATEGORIES = configData.categories || [];
        DEPARTMENTS = configData.departments || [];
        
        console.log('DB設定ロード完了:', { categories: CATEGORIES, departments: DEPARTMENTS, dataSourceId: DATA_SOURCE_ID });
        renderFormOptions(); // フォームのオプションをレンダリング

    } catch (e) {
        console.error('DB設定ロードエラー:', e);
        // data_source_id の取得エラーは致命的なため、再設定を促す
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
    const categorySelect = document.getElementById('taskCategory');
    const departmentDiv = document.getElementById('departmentChecks');

    // カテゴリ (Select)
    categorySelect.innerHTML = '<option value="">-- 選択 --</option>';
    CATEGORIES.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        categorySelect.appendChild(option);
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

/**
 * タスク一覧をNotionからロードしてレンダリング
 */
async function loadTaskList() {
    console.log('タスク一覧をロード中...');
    
    // Notion API v2025-09-03 対応: data_source_id を使用
    const targetUrl = `https://api.notion.com/v1/data_sources/${DATA_SOURCE_ID}/query`; 

    const filter = {
        // ステータスが「完了」ではないものを取得
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

        tasks.forEach(task => {
            // プロパティを安全に抽出
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
            // 完了ボタンにイベントリスナーを設定
            listItem.querySelector('.btn-success').addEventListener('click', () => markTaskCompleted(pageId));
            $taskList.appendChild(listItem);
        });

    } catch (e) {
        $taskList.innerHTML = `<p class="error-message">タスク一覧のロードに失敗しました。エラー: ${e.message}</p>`;
        console.error('タスク一覧ロードエラー:', e);
    }
}

/**
 * KPI（今週/今月の計測時間）をロードしてレンダリング
 */
async function loadKpi() {
    console.log('KPIをロード中...');
    
    try {
        // Notion API v2025-09-03 対応: data_source_id を使用
        const kpiData = await apiCustomFetch('getKpi', {
            dataSourceId: DATA_SOURCE_ID, // 修正
            tokenValue: NOTION_TOKEN
        });

        const formatMins = (mins) => {
            const h = Math.floor(mins / 60);
            const m = mins % 60;
            return `${h}h ${m}m`;
        };

        let categoryListHtml = '';
        const sortedCategories = Object.entries(kpiData.categoryWeekMins || {}).sort(([, a], [, b]) => b - a);
        
        sortedCategories.forEach(([category, mins]) => {
            categoryListHtml += `<li>${category}: ${formatMins(mins)}</li>`;
        });

        $kpiMetrics.innerHTML = `
            <h3>🕒 計測サマリー</h3>
            <div class="kpi-grid">
                <div class="kpi-card">今週合計: <strong>${formatMins(kpiData.totalWeekMins)}</strong></div>
                <div class="kpi-card">今月合計: <strong>${formatMins(kpiData.totalMonthMins)}</strong></div>
            </div>
            <h4>今週のカテゴリ別時間</h4>
            <ul class="category-list">${categoryListHtml || '<li>データなし</li>'}</ul>
        `;
    } catch (e) {
        $kpiMetrics.innerHTML = `<p class="error-message">KPIのロードに失敗しました。エラー: ${e.message}</p>`;
        console.error('KPIロードエラー:', e);
    }
}

// =========================================================================
// アクション処理
// =========================================================================

/**
 * 新規タスクをNotionに作成する
 */
async function createNotionTask(title, category, departments) {
    if (!DATA_SOURCE_ID) {
        alert('エラー: データベース設定が不完全です。設定モーダルでDB IDを保存してください。');
        return;
    }

    const deptProps = departments.map(d => ({ name: d }));

    const pageProperties = {
        'タスク名': {
            title: [{ type: 'text', text: { content: title } }]
        },
        'カテゴリ': {
            select: { name: category }
        },
        '部門': {
            multi_select: deptProps
        },
        'ステータス': {
            status: { name: 'ToDo' } 
        }
    };

    // Notion API v2025-09-03 対応: database_id ではなく data_source_id を使用
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

/**
 * タスクを完了済みにマークする
 */
async function markTaskCompleted(pageId) {
    if (confirm('このタスクを「完了」にしますか？')) {
        const targetUrl = `https://api.notion.com/v1/pages/${pageId}`;
        const updateProperties = {
            'ステータス': {
                status: { name: '完了' }
            },
            '完了日': {
                date: { start: new Date().toISOString().split('T')[0] } 
            }
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

/**
 * Togglの現在実行中のタスクをチェックし、UIに表示する
 */
async function checkRunningState() {
    if (!TOGGL_API_TOKEN) {
        $runningTask.textContent = 'Toggl連携なし';
        return;
    }
    
    try {
        const runningEntry = await getTogglRunningEntry();
        
        if (runningEntry) {
            const description = runningEntry.description || 'タイトルなし';
            const projectId = runningEntry.pid;
            
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

/**
 * Togglの実行中のエントリを取得する
 */
async function getTogglRunningEntry() {
    // Toggl API v9 エンドポイント
    const targetUrl = 'https://api.track.toggl.com/api/v9/me/time_entries/current';
    
    // TogglはGETリクエストを使用
    const response = await apiFetch(targetUrl, 'GET', null, 'togglApiToken', TOGGL_API_TOKEN);
    // 実行中のエントリがない場合、レスポンスは null になる
    return response;
}

/**
 * Togglの実行中のエントリを停止する
 */
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


// =========================================================================
// プロキシ通信ヘルパー
// =========================================================================

/**
 * 標準のAPIプロキシ呼び出し関数 (Notion/TogglのCRUD操作に使用)
 * @param {string} targetUrl - 宛先APIの完全なURL
 * @param {string} method - HTTPメソッド (GET, POST, PATCHなど)
 * @param {object | null} body - リクエストボディ
 * @param {string} tokenKey - トークンの種類 ('notionToken' or 'togglApiToken')
 * @param {string} tokenValue - トークン値
 */
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

    // サーバーレス関数内でエラーが発生した場合
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

    // Togglの実行中タスクAPIは null を返すことがあるため、JSONとしてパースできるかチェック
    const responseText = await response.text();
    return responseText ? JSON.parse(responseText) : null;
}

/**
 * カスタムエンドポイント呼び出し関数 (getConfig, getKpiに使用)
 * @param {string} customEndpoint - カスタムエンドポイント名 ('getConfig' or 'getKpi')
 * @param {object} params - パラメータ (dbId, dataSourceId, tokenValueなど)
 */
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
// UIイベントリスナー
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

/**
 * 設定をローカルストレージに保存する
 */
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
    document.getElementById('inputNotionToken').value = NOTION_TOKEN;
    document.getElementById('inputDbId').value = DB_ID;
    document.getElementById('inputTogglToken').value = TOGGL_API_TOKEN;
    $settingsModal.style.display = 'flex';
}

/**
 * 設定モーダルを閉じる
 */
$settingsModal.querySelector('.close-btn').addEventListener('click', () => {
    $settingsModal.style.display = 'none';
});

// ローディングUI表示・非表示
function showLoading() {
    $loadingSpinner.style.display = 'block';
}

function hideLoading() {
    $loadingSpinner.style.display = 'none';
}
