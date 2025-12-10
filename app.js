// =========================================================================
// 設定とグローバル変数
// =========================================================================

// プロキシサーバーのURL (Vercelデプロイ後のURLに置き換えてください)
const PROXY_URL = 'https://notion-proxy-repo.vercel.app/api/proxy'; 

// ローカルストレージキー
const STORAGE_KEY = 'taskTrackerSettings';

// ★★★ 修正点: index.htmlのIDに合わせて変更 ★★★
// HTML要素を参照し、存在しない場合は null になる
const $settingsModal = document.getElementById('settingsView'); 
const $taskForm = document.getElementById('newTaskContainer'); 
const $taskList = document.getElementById('taskList');
const $kpiPanel = document.getElementById('kpiPanel'); 
const $runningTaskContainer = document.getElementById('runningTaskContainer');
const $settingsBtn = document.getElementById('toggleSettings'); 
const $saveSettingsBtn = document.getElementById('saveConfig'); 
const $cancelConfigBtn = document.getElementById('cancelConfig'); // 追加
const $startNewTaskButton = document.getElementById('startNewTaskButton'); // 追加
const $reloadTasksBtn = document.getElementById('reloadTasks'); // 追加
// ローディングスピナー要素はHTMLに存在しないため、参照しない

// グローバル変数の定義
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
    showLoading(); // ★★★ これがエラー行37行目付近

    loadSettings();

    if (NOTION_TOKEN && DB_ID) {
        try {
            await loadDbConfig(); 
            
            if (!DATA_SOURCE_ID) {
                throw new Error("Notion設定エラー: データソースIDの取得に失敗しました。設定を確認してください。");
            }
            
            await checkRunningState(); 
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
        DB_ID = savedSettings.dbId || '';
        TOGGL_API_TOKEN = savedSettings.togglApiToken || '';
    }
}

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

function renderFormOptions() {
    // index.htmlのIDに合わせて修正
    const categoryContainer = document.getElementById('newCatContainer'); 
    const departmentDiv = document.getElementById('newDeptContainer');

    // カテゴリ (Select) - HTMLにSelectタグがないため、新たにSelectタグを作成してコンテナに挿入
    categoryContainer.innerHTML = '<h4>カテゴリ</h4><select id="taskCategory"></select>';
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

async function loadTasksAndKpi() {
    await loadTaskList();
    await loadKpi();
}

async function loadTaskList() {
    console.log('タスク一覧をロード中...');
    
    if (!DATA_SOURCE_ID) {
        $taskList.innerHTML = '<li><p>設定が必要です。設定画面からNotionトークンとDB IDを入力してください。</p></li>';
        return;
    }

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
            // HTMLのボタンに合わせる
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
                // 親の li 要素を探すなどして、クリックイベントのターゲットを特定する必要があるが、ここではシンプルに pageId を使用
                markTaskCompleted(e.target.dataset.pageId);
            });
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
// アクション処理
// =========================================================================

async function createNotionTask(e) {
    e.preventDefault();
    
    const title = document.getElementById('newTaskTitle').value;
    const category = document.getElementById('taskCategory')?.value; // Nullチェックを追加
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
    // ... (Notion API呼び出しロジックは変更なし)
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
        $runningTaskContainer.classList.remove('hidden'); // HTMLのhiddenクラスを消して表示
        return;
    }
    
    try {
        const runningEntry = await getTogglRunningEntry();
        
        if (runningEntry) {
            const description = runningEntry.description || 'タイトルなし';
            document.getElementById('runningTaskTitle').textContent = description;
            $runningTaskContainer.classList.remove('hidden');
            // ... (タイマー表示ロジックは省略)
        } else {
            document.getElementById('runningTaskTitle').textContent = '🔵 実行中のタスクはありません';
            // $runningTaskContainer.classList.add('hidden'); // タスクなしでも表示しておく
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
// プロキシ通信ヘルパー (省略)
// =========================================================================
// ... (apiFetch, apiCustomFetch は変更なし)


// =========================================================================
// UIイベントリスナー
// =========================================================================
// ★★★ ここからが410行目付近のイベントリスナー定義 ★★★

if ($startNewTaskButton) {
    $startNewTaskButton.addEventListener('click', createNotionTask);
} else {
    console.error('DOM Error: #startNewTaskButton が見つかりません');
}

if ($settingsBtn) {
    $settingsBtn.addEventListener('click', openSettingsModal);
} else {
    console.error('DOM Error: #toggleSettings が見つかりません');
}

if ($saveSettingsBtn) {
    $saveSettingsBtn.addEventListener('click', saveSettings);
} else {
    console.error('DOM Error: #saveConfig が見つかりません');
}

if ($cancelConfigBtn) {
    $cancelConfigBtn.addEventListener('click', () => {
        $settingsModal.classList.add('hidden');
    });
} else {
    console.error('DOM Error: #cancelConfig が見つかりません');
}

if ($reloadTasksBtn) {
    $reloadTasksBtn.addEventListener('click', loadTasksAndKpi);
} else {
    console.error('DOM Error: #reloadTasks が見つかりません');
}


// =========================================================================
// 設定モーダル関数
// =========================================================================

function saveSettings() {
    const notionToken = document.getElementById('confNotionToken').value;
    const dbId = document.getElementById('confNotionDbId').value;
    const togglApiToken = document.getElementById('confTogglToken').value;
    // ... (その他、Notion User IDなどは無視)

    if (!notionToken || !dbId) {
        alert('NotionトークンとDB IDは必須です。');
        return;
    }

    const settings = { notionToken, dbId, togglApiToken };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    
    NOTION_TOKEN = notionToken;
    DB_ID = dbId;
    TOGGL_API_TOKEN = togglApiToken;

    alert('設定を保存しました。アプリケーションをリロードします。');
    $settingsModal.classList.add('hidden');
    location.reload(); 
}

function openSettingsModal() {
    // HTMLのIDに合わせて変更
    document.getElementById('confNotionToken').value = NOTION_TOKEN;
    document.getElementById('confNotionDbId').value = DB_ID;
    document.getElementById('confTogglToken').value = TOGGL_API_TOKEN;
    $settingsModal.classList.remove('hidden'); 
}


// =========================================================================
// ローディングUI
// =========================================================================
// ★★★ エラー対策: $loadingSpinnerを参照しないロジックに変更 ★★★

function showLoading() {
    document.body.style.cursor = 'wait';
    document.body.style.pointerEvents = 'none'; // 操作不可にする
}

function hideLoading() {
    document.body.style.cursor = 'default';
    document.body.style.pointerEvents = 'auto';
}
